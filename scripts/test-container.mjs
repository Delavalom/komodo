/** End-to-end proof for the built container image. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
assert.equal(args.length, 1, "usage: node scripts/test-container.mjs [--] <image>");
const [image] = args;

const port = await reservePort();
const name = `komodo-e2e-${process.pid}-${Date.now()}`;
let started = false;

try {
  execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      name,
      "--publish",
      `127.0.0.1:${port}:4400`,
      image,
      "dev",
      "--no-poll",
      "--port",
      "4400",
    ],
    { stdio: "pipe" },
  );
  started = true;

  const origin = new URL(`http://127.0.0.1:${port}`);
  const health = await waitForHealth(new URL("/api/health", origin), 60_000, name);
  assert.equal(health.ok, true);
  assert.equal(health.db, "ok");
  assert.equal(health.lastPollAt, null, "the container smoke must not poll GitHub");

  const queueResponse = await fetch(new URL("/delavalom-labs/-/queue", origin));
  assert.equal(queueResponse.status, 200, "the container must render the seeded queue");
  assert.match(await queueResponse.text(), /Review queue/);
  console.log(`container E2E passed on port ${port}`);
} catch (error) {
  if (started) {
    try {
      const logs = execFileSync("docker", ["logs", name], { encoding: "utf8" });
      if (logs.trim()) console.error(`\n--- container output ---\n${logs.trim()}\n--- end output ---`);
    } catch {
      // The original failure is more useful than a secondary log-read error.
    }
  }
  throw error;
} finally {
  if (started) {
    try {
      execFileSync("docker", ["rm", "--force", "--volumes", name], { stdio: "ignore" });
    } catch {
      // A container that was already removed has nothing left to clean up.
    }
  }
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

async function waitForHealth(url, timeoutMs, containerName) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return await response.json();
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
      const running = execFileSync(
        "docker",
        ["inspect", "--format", "{{.State.Running}}", containerName],
        { encoding: "utf8" },
      ).trim();
      if (running !== "true") {
        throw new Error("container exited before health became ready", { cause: error });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`container health did not become ready: ${String(lastError)}`);
}
