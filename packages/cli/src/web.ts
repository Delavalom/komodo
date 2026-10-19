/**
 * Finding and starting the bundled web app.
 *
 * `komodo dev` has to work on a machine that never ran pnpm install, so the
 * app is a Next standalone bundle rather than a workspace the CLI reaches
 * into.
 *
 * It ships as a tarball rather than as a directory because npm drops any
 * directory named node_modules from a published package, and the standalone
 * server resolves its own requires out of exactly that directory — a
 * published `dist/web/` would arrive hollow and die on its first require. So
 * the bundle travels as one file and is unpacked once, into a versioned cache
 * under ~/.komodo, and reused from there.
 *
 * Three places are checked, and the error when none of them hit says what to
 * do about it.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Names the unpack directory, so upgrading the CLI cannot reuse a stale app —
 * and answers `--version`, so the two can never disagree about which release
 * this is. It was a literal in index.ts for three releases and said 0.1.0
 * throughout.
 */
export function cliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "dev";
  } catch {
    return "dev";
  }
}

export function resolveWebServer(): string {
  // Explicit wins: this is the escape hatch when someone builds the app
  // themselves or mounts it into a container.
  if (process.env.KOMODO_WEB_DIR) {
    const explicit = join(process.env.KOMODO_WEB_DIR, "server.js");
    if (existsSync(explicit)) return explicit;
  }

  // A checkout of the monorepo. Ahead of the packaged bundle deliberately: in
  // a development tree the freshly built app is the one you meant.
  const workspace = resolve(
    here,
    "../../../apps/web/.next/standalone/apps/web/server.js",
  );
  if (existsSync(workspace)) return workspace;

  const unpacked = unpackBundle();
  if (unpacked) return unpacked;

  throw new Error(
    "Could not find the Komodo web server.\n" +
      "From a checkout, build it first:  pnpm -C apps/web build\n" +
      "Otherwise point KOMODO_WEB_DIR at a Next standalone output directory.",
  );
}

/**
 * Unpacks dist/web.tgz on first use.
 *
 * Extraction goes to a scratch directory and is then renamed into place, so
 * two processes racing on a cold cache cannot leave a half-written tree
 * behind for a third to run.
 */
function unpackBundle(): string | undefined {
  const tarball = join(here, "web.tgz");
  if (!existsSync(tarball)) return undefined;

  const dest = join(homedir(), ".komodo", "web", cliVersion());
  const server = join(dest, "standalone", "apps", "web", "server.js");
  if (existsSync(server)) return server;

  const scratch = mkdtempSync(join(tmpdir(), "komodo-web-"));
  try {
    execFileSync("tar", ["-xzf", tarball, "-C", scratch], {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 5 * 60 * 1000,
    });
    mkdirSync(dirname(dest), { recursive: true });
    try {
      renameSync(scratch, dest);
    } catch {
      // Another process got there first, which is a fine outcome — its tree
      // is the same bytes as this one.
      if (!existsSync(server)) throw new Error("could not install the web bundle");
    }
  } catch (err) {
    rmSync(scratch, { recursive: true, force: true });
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not unpack the Komodo web app: ${detail}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  return existsSync(server) ? server : undefined;
}

export interface WebServerOptions {
  port: number;
  /** Passed through so the app opens the same database the ingester writes. */
  dbTarget: string;
  /**
   * Whether an empty store should be filled with the sample queue.
   *
   * The app used to decide this for itself, which meant a deployment whose
   * ingester had not finished its first pass showed the team invented
   * repositories and invented pull requests. The caller knows whether it is a
   * laptop or a deployment; the app does not.
   */
  seed?: boolean;
  /**
   * Directory holding komodo.yaml.
   *
   * The app reads the config for one thing — `local.url`, the base of the
   * permalink a receipt carries back to this deployment. It cannot find the
   * file on its own: the standalone server runs from its own bundle
   * directory, so `process.cwd()` there is `.next/standalone/apps/web` and
   * never the directory anyone put komodo.yaml in. Without this every receipt
   * posted from the queue links at localhost.
   */
  configDir?: string;
  onExit?: (code: number | null) => void;
}

/**
 * Starts the bundled web app and reports back which port it is bound to.
 *
 * `options.port === 0` means "the OS picks" — but the Next standalone
 * `server.js` this spawns reads its port with
 * `parseInt(process.env.PORT, 10) || 3000`, which treats the string `"0"` as
 * falsy and silently binds 3000 instead of an ephemeral port. So the pick has
 * to happen here, in this process, immediately before the spawn that uses
 * it: `pickFreePort` binds and releases a real port with nothing else
 * scheduled in between, then that fixed, non-zero number goes to the child.
 * That is a smaller version of the same reserve-then-reuse gap the E2E
 * scripts used to have at arm's length — true fd-level hand-off would close
 * it, but would mean patching Next's generated server.js, which is
 * regenerated on every build and not ours to keep edits in.
 */
export async function startWebServer(
  options: WebServerOptions,
): Promise<{ child: ChildProcess; port: number }> {
  const server = resolveWebServer();
  const port = options.port === 0 ? await pickFreePort() : options.port;
  const hostname = process.env.HOSTNAME ?? "127.0.0.1";
  if (options.port === 0) {
    // Printed only for the "OS picks" case, so a caller that asked for
    // --port 0 (the E2E scripts) can read back the real port from stdout
    // instead of reserving one of its own and handing it over — the
    // two-process version of this same gap, but with a test harness, pnpm
    // and tarball installs able to run in between. A fixed --port (every
    // normal `komodo dev`/`komodo serve` run) already knows its own port, so
    // this would just be noise there; serve.ts's own banner covers that case
    // once the store snapshot resolves.
    console.log(`listening on http://${hostname}:${port}`);
  }
  const child = spawn(process.execPath, [server], {
    cwd: dirname(server),
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname,
      KOMODO_DB: options.dbTarget,
      KOMODO_SEED: options.seed ? "1" : "0",
      ...(options.configDir ? { KOMODO_CONFIG_DIR: options.configDir } : {}),
      // Only set when it is really a connection string: an empty value here
      // is not nullish, so `??` downstream would happily take it.
      ...(options.dbTarget.startsWith("postgres")
        ? { DATABASE_URL: options.dbTarget }
        : {}),
      NODE_ENV: "production",
    },
  });
  // Without this, a spawn failure (bad path, EACCES) emits only 'error' with
  // no listener attached — an uncaught exception instead of a reported exit.
  child.once("error", (err) => {
    console.error(`Web server failed to start: ${err.message}`);
    options.onExit?.(1);
  });
  if (options.onExit) child.on("exit", options.onExit);
  return { child, port };
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}
