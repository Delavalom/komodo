/**
 * End-to-end proof for the npm package.
 *
 * The test installs the packed tarball as a consumer would. It then starts
 * the installed CLI, lets that CLI unpack its bundled web app, and requests
 * the seeded queue. Running a workspace entry point would miss packaging
 * failures because the CLI prefers the checkout's Next build.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "komodo-packed-e2e-"));
const packDir = join(scratch, "pack");
const consumerDir = join(scratch, "consumer");
let child;
let childExit;
let childExited = false;
let logs = "";
let cacheDir;

try {
  mkdirSync(packDir, { recursive: true });
  writeFileSync(
    join(scratch, "package.json"),
    JSON.stringify({ name: "komodo-packed-e2e", private: true }, null, 2),
  );

  run("pnpm", [
    "--filter",
    "komodo-review",
    "pack",
    "--pack-destination",
    packDir,
  ]);

  const tarballs = readdirSync(packDir)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => join(packDir, name));
  assert.equal(tarballs.length, 1, "the release build must produce one npm tarball");

  run("pnpm", ["--dir", scratch, "add", "--ignore-scripts", tarballs[0]]);

  const packageRoot = join(scratch, "node_modules", "komodo-review");
  const packageJson = join(packageRoot, "package.json");
  const manifest = JSON.parse(readFileSync(packageJson, "utf8"));
  const testVersion = `${manifest.version}-e2e.${process.pid}.${Date.now()}`;
  manifest.version = testVersion;
  writeFileSync(packageJson, `${JSON.stringify(manifest, null, 2)}\n`);

  const webBundle = join(packageRoot, "dist", "web.tgz");
  assert.ok(existsSync(webBundle), "the npm tarball must contain dist/web.tgz");
  cacheDir = join(homedir(), ".komodo", "web", testVersion);

  const cli = join(packageRoot, "dist", "index.js");
  const reportedVersion = execFileSync(process.execPath, [cli, "--version"], {
    encoding: "utf8",
  }).trim();
  assert.equal(reportedVersion, testVersion, "the installed CLI must read its package version");

  const port = await reservePort();
  const db = join(consumerDir, "komodo.db");
  const env = tokenFreeEnvironment();
  child = spawn(
    process.execPath,
    [cli, "dev", "--no-poll", "--port", String(port), "--db", db],
    {
      cwd: scratch,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  childExit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      childExited = true;
      resolve({ code, signal });
    });
  });

  const origin = new URL(`http://127.0.0.1:${port}`);
  const health = await waitForHealth(new URL("/api/health", origin), 60_000);
  assert.deepEqual(health, {
    ok: true,
    db: "ok",
    lastPollAt: null,
    pollStale: false,
    lastPollError: null,
  });

  const rootResponse = await fetch(origin, { redirect: "manual" });
  assert.ok(
    rootResponse.status === 307 || rootResponse.status === 308,
    `the app root must redirect, received ${rootResponse.status}`,
  );
  const location = rootResponse.headers.get("location");
  assert.ok(location, "the app root must include a redirect location");
  const queueUrl = new URL(location, origin);
  assert.equal(queueUrl.pathname, "/delavalom-labs/-/queue");

  const queueResponse = await fetch(queueUrl);
  assert.equal(queueResponse.status, 200, "the seeded queue must render");
  const html = await queueResponse.text();
  assert.match(html, /Review queue/, "the response must contain the queue heading");

  const assetPath = html.match(/["'](\/_next\/static\/[^"']+\.js(?:\?[^"']*)?)["']/)?.[1];
  assert.ok(assetPath, "the queue HTML must reference a Next JavaScript asset");
  const assetResponse = await fetch(new URL(assetPath, origin));
  assert.equal(assetResponse.status, 200, "the standalone server must serve its JavaScript");
  assert.ok(
    (await assetResponse.arrayBuffer()).byteLength > 0,
    "the JavaScript asset must not be empty",
  );

  const exit = await stopChild();
  assert.equal(exit.code, 0, `the CLI must stop cleanly${formatLogs()}`);
  console.log(`packed CLI E2E passed on port ${port}`);
} catch (error) {
  if (logs) console.error(formatLogs());
  throw error;
} finally {
  await stopChild({ force: true });
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}

function capture(chunk) {
  logs = `${logs}${chunk.toString()}`.slice(-64 * 1024);
}

function formatLogs() {
  return `\n--- packed CLI output ---\n${logs.trim()}\n--- end output ---`;
}

function tokenFreeEnvironment() {
  const env = {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    NO_COLOR: "1",
  };
  for (const key of [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CODEX_API_KEY",
    "DATABASE_URL",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "KOMODO_DB",
    "KOMODO_WEB_DIR",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
  ]) {
    delete env[key];
  }
  return env;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (childExited) {
      const exit = await childExit;
      throw new Error(
        `the installed CLI exited before it became healthy: ${JSON.stringify(exit)}${formatLogs()}`,
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return await response.json();
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`health did not become ready: ${String(lastError)}${formatLogs()}`);
}

async function stopChild(options = {}) {
  if (!child || childExited) return childExit ? await childExit : { code: 0, signal: null };
  child.kill("SIGTERM");
  const timeoutMs = options.force ? 5_000 : 10_000;
  const result = await Promise.race([
    childExit,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (result) return result;
  child.kill("SIGKILL");
  const forced = await childExit;
  if (options.force) return forced;
  throw new Error(`the installed CLI did not stop within ${timeoutMs}ms${formatLogs()}`);
}
