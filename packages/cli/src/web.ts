/**
 * Finding and starting the bundled web app.
 *
 * `komodo dev` has to work on a machine that never ran pnpm install, so the
 * app is a Next standalone bundle rather than a workspace the CLI reaches
 * into. Three places are checked, most explicit first, and the error when
 * none of them hit says what to do about it.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function candidates(): string[] {
  const out: string[] = [];
  if (process.env.KOMODO_WEB_DIR) {
    out.push(join(process.env.KOMODO_WEB_DIR, "server.js"));
  }
  // Shipped inside the package.
  out.push(join(here, "web", "server.js"));
  // Running from a checkout of the monorepo.
  out.push(
    resolve(here, "../../../apps/web/.next/standalone/apps/web/server.js"),
  );
  return out;
}

export function resolveWebServer(): string {
  for (const path of candidates()) if (existsSync(path)) return path;
  throw new Error(
    "Could not find the Komodo web server.\n" +
      "From a checkout, build it first:  pnpm -C apps/web build\n" +
      "Otherwise point KOMODO_WEB_DIR at a Next standalone output directory.",
  );
}

export interface WebServerOptions {
  port: number;
  /** Passed through so the app opens the same database the ingester writes. */
  dbPath: string;
  onExit?: (code: number | null) => void;
}

export function startWebServer(options: WebServerOptions): ChildProcess {
  const server = resolveWebServer();
  const child = spawn(process.execPath, [server], {
    cwd: dirname(server),
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      PORT: String(options.port),
      HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1",
      KOMODO_DB: options.dbPath,
      NODE_ENV: "production",
    },
  });
  if (options.onExit) child.on("exit", options.onExit);
  return child;
}
