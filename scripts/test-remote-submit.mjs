/**
 * End-to-end proof that an agent can hand a review back over HTTP.
 *
 * The interactive path used to open the store's SQLite file directly, which
 * meant it worked on the machine running `komodo dev` and nowhere else. This
 * exercises the replacement against a real running deployment: mint a key,
 * lease a job, build a record from a real git checkout, post it, and read the
 * stored review back out. Then it tries every way of getting it wrong.
 *
 * Run against the workspace build:
 *   pnpm --filter '@komodo/ingest...' build && pnpm -C apps/web build
 *   node scripts/test-remote-submit.mjs
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "komodo-remote-e2e-"));
const db = join(scratch, "komodo.db");
const repoDir = join(scratch, "repo");

let child;
let childExited = false;
let logs = "";
let failures = 0;

const { SqliteStore } = await import(join(root, "packages/store/dist/sqlite.js"));
const { mintApiKey } = await import(join(root, "packages/store/dist/api-key.js"));

try {
  /* ── A repository, a pull request, and one queued job ─────────────────── */

  const headSha = seedGitRepo();
  const secret = await seedStore(headSha);

  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  child = startDeployment(port);
  await waitForHealth(`${origin}/api/health`, 90_000);

  /* ── The happy path, as the CLI walks it ──────────────────────────────── */

  const claimed = await api(origin, secret, "POST", "/api/v1/jobs/claim");
  await check("claim leases the queued job", () => {
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.claimed, true);
    assert.equal(claimed.body.claim.prId, "acme/api#1");
    assert.equal(claimed.body.claim.headSha, headSha);
    assert.match(claimed.body.claim.workerId, /^api-key:/);
    assert.equal(claimed.body.claim.host, origin);
  });
  const claim = claimed.body.claim;

  await check("a second claim never hands out the job already leased", async () => {
    // Two pull requests are queued, so this must find the other one — an
    // exclusive lease is the property, not an empty queue.
    const again = await api(origin, secret, "POST", "/api/v1/jobs/claim");
    assert.equal(again.body.claimed, true);
    assert.notEqual(again.body.claim.jobId, claimed.body.claim.jobId);
    assert.equal(again.body.claim.prId, "acme/api#2");

    const third = await api(origin, secret, "POST", "/api/v1/jobs/claim");
    assert.equal(third.body.claimed, false, "nothing is left to claim");
  });

  const record = reviewRecord(headSha);

  await check("submitting without a key is refused", async () => {
    const res = await api(origin, null, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record,
    });
    assert.equal(res.status, 401);
  });

  await check("a record that does not validate is refused with the reason", async () => {
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record: { ...record, result: { ...record.result, confidence: 99 } },
    });
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.body.issues), "the failure must name the field");
  });

  await check("another worker cannot submit against this lease", async () => {
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: "api-key:someone-else",
      record,
    });
    assert.equal(res.status, 409);
  });

  await check("a review of a different head is refused", async () => {
    const moved = { ...record, pr: { ...record.pr, headSha: "f".repeat(40) } };
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record: moved,
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /claimed at/);
  });

  await check("a key that did not take the lease cannot settle the job", async () => {
    // A worker id is not a secret — it travels in a claim file and appears on
    // the queue's own unauthenticated screens. What has to match is the
    // credential the lease was taken with.
    const other = await mintKey();
    const res = await api(origin, other, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record,
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.error, /API key/);
  });

  await check("a record describing a different pull request is refused", async () => {
    const elsewhere = { ...record, pr: { ...record.pr, number: 9999 } };
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record: elsewhere,
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /describes/);
  });

  await check("a record with two files at one path is refused, not half-written", async () => {
    // The store derives a review file's id from its path, so a duplicate threw
    // a constraint violation between the judgment write and the review write —
    // leaving the queue advertising a completed review that could not be
    // opened, and the job wedged in `running` for two hours.
    const dup = {
      ...record,
      files: [...record.files, { ...record.files[0] }],
    };
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record: dup,
    });
    assert.equal(res.status, 400);
    assert.ok(JSON.stringify(res.body).includes("same path"));
  });

  await check("a review that says nothing is refused", async () => {
    const empty = {
      ...record,
      result: { ...record.result, summary: "", verdict: "" },
    };
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record: empty,
    });
    assert.equal(res.status, 400);
  });

  await check("a malformed job id answers, rather than throwing a 500", async () => {
    const res = await api(origin, secret, "POST", "/api/v1/jobs/%25/submit", {
      workerId: claim.workerId,
      record,
    });
    assert.equal(res.status, 404, JSON.stringify(res.body));
  });

  await check("a body over the limit is refused", async () => {
    const oversized = {
      workerId: "w",
      record: { ...record, files: [{ ...record.files[0], patch: "x".repeat(17 * 1024 * 1024) }] },
    };
    const res = await api(origin, secret, "POST", "/api/v1/jobs/x/submit", oversized);
    assert.equal(res.status, 413, JSON.stringify(res.body).slice(0, 200));
  });

  let reviewId;
  await check("the lease holder's submission is stored and settles the job", async () => {
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.settled, true);
    assert.equal(res.body.reviewId, `acme/api#1@${headSha}`);
    assert.match(res.body.url, /\/-\/pr\/acme\/api\/1\?run=/);
    reviewId = res.body.reviewId;
  });

  await check("the stored review reads back with its judgements and checks", async () => {
    const res = await api(origin, secret, "GET", `/api/v1/reviews/${encodeURIComponent(reviewId)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.review.provider, "claude-skill");
    assert.equal(res.body.review.version, 3);
    assert.equal(res.body.judgements.length, 1);
    assert.equal(res.body.judgements[0].title, record.result.judgements[0].title);
    assert.equal(res.body.verificationRequirements.length, 1);
  });

  await check("the queue now shows a completed judgment for that head", async () => {
    const res = await api(origin, secret, "GET", "/api/v1/queue");
    const judgment = res.body.judgments.find((j) => j.prId === "acme/api#1");
    assert.ok(judgment, "the review must appear in the queue");
    assert.equal(judgment.status, "completed");
    assert.equal(judgment.headSha, headSha);
  });

  await check("a forged forwarded host does not become the claim's address", async () => {
    // The claim's host is written to a file on the agent's machine and later
    // handed a working API key. A header cannot be allowed to choose it.
    const res = await fetch(`${origin}/api/v1/jobs/claim`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Forwarded-Host": "evil.attacker.test",
        "X-Forwarded-Proto": "https",
      },
    });
    const body = await res.json();
    if (body.claimed) {
      assert.ok(
        !String(body.claim.host).includes("evil.attacker.test"),
        `claim host was ${body.claim.host}`,
      );
    }
  });

  await check("resubmitting the settled job is refused, not silently doubled", async () => {
    const res = await api(origin, secret, "POST", `/api/v1/jobs/${encodeURIComponent(claim.jobId)}/submit`, {
      workerId: claim.workerId,
      record,
    });
    assert.equal(res.status, 409);
  });

  /* ── The claimless path, for a branch reviewed without a job ───────────── */

  await check("a direct submission for an unknown pull request is refused", async () => {
    const res = await api(origin, secret, "POST", "/api/v1/reviews", {
      prId: "acme/api#404",
      record,
    });
    assert.equal(res.status, 404);
  });

  await check("a direct submission at the wrong head is refused", async () => {
    const res = await api(origin, secret, "POST", "/api/v1/reviews", {
      prId: "acme/api#2",
      record: { ...record, pr: { ...record.pr, headSha: "e".repeat(40) } },
    });
    assert.equal(res.status, 409);
  });

  await check("a direct submission cannot overwrite a review already answered", async () => {
    const res = await api(origin, secret, "POST", "/api/v1/reviews", {
      prId: "acme/api#1",
      record,
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.error, /already has a review/);
  });

  await check("a direct submission into a switched-off repository is refused", async () => {
    const store = new SqliteStore({ path: db });
    try {
      await store.upsertRepository({
        id: "acme/off", owner: "acme", name: "off",
        provider: "github", enabled: false, reviewCount: 0,
      });
      await store.upsertPullRequest({ ...pullRequest(1, headSha), repoId: "acme/off" });
    } finally {
      store.close();
    }

    const res = await api(origin, secret, "POST", "/api/v1/reviews", {
      prId: "acme/off#1",
      record: { ...record, pr: { ...record.pr, repo: "off" } },
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.error, /switched off/);
  });

  await check("a direct submission at the current head is stored", async () => {
    const res = await api(origin, secret, "POST", "/api/v1/reviews", {
      prId: "acme/api#2",
      record: { ...record, pr: { ...record.pr, number: 2 } },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reviewId, `acme/api#2@${headSha}`);
  });

  await check("it also settles the job that was queued for that head", async () => {
    const store = new SqliteStore({ path: db });
    try {
      const jobs = await store.listAIReviewJobs();
      const job = jobs.find((j) => j.prId === "acme/api#2");
      assert.equal(job.state, "completed", "a queued job for a hand-reviewed head must not stay queued");
    } finally {
      store.close();
    }
  });

  /* ── The CLI, end to end, against that same deployment ─────────────────── */

  await check("komodo-review login saves the host after proving the key works", () => {
    const out = cli(["login", "--host", origin, "--api-key", secret], { HOME: scratch });
    assert.match(out, /Connected to/);
  });

  await check("login refuses a key that does not work", () => {
    assert.throws(
      () => cli(["login", "--host", origin, "--api-key", "kmd_not_a_key"], { HOME: scratch }),
      /401|not valid/,
    );
  });

  await check("login refuses to send a key in clear text to a remote host", () => {
    assert.throws(
      () => cli(["login", "--host", "http://komodo.example.com", "--api-key", secret], { HOME: scratch }),
      /clear text/,
    );
  });

  await check("claim --host writes a claim file naming the deployment", async () => {
    // Something to claim: a third pull request with a queued job.
    const store = new SqliteStore({ path: db });
    try {
      await store.upsertPullRequest(pullRequest(3, headSha));
      await store.requestAIReview({
        prId: "acme/api#3",
        headSha,
        trigger: "manual",
        requestedAt: Date.now(),
      });
    } finally {
      store.close();
    }

    const out = cli(["claim"], { HOME: scratch, KOMODO_HOST: origin, KOMODO_API_KEY: secret });
    assert.match(out, /acme\/api#3/);
    const claimFile = out.split("\n")[0].trim();
    const parsed = JSON.parse(execFileSync("cat", [claimFile], { encoding: "utf8" }));
    assert.equal(parsed.host, origin);
    assert.equal(parsed.prId, "acme/api#3");
    assert.ok(!("database" in parsed), "a remote claim must not name a database");

    // …and submit it from the checkout whose HEAD is the claimed commit.
    const resultPath = join(scratch, "result.json");
    writeFileSync(resultPath, JSON.stringify({ result: record.result }, null, 2));
    const submitted = cli(["submit", claimFile, resultPath], {
      HOME: scratch,
      KOMODO_HOST: origin,
      KOMODO_API_KEY: secret,
      cwd: repoDir,
    });
    assert.match(submitted, /Review completed: acme\/api#3@/);
  });

  await check("the CLI's submission is readable through the API", async () => {
    const res = await api(origin, secret, "GET", `/api/v1/reviews/${encodeURIComponent(`acme/api#3@${headSha}`)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.judgements.length, 1);
  });

  await check("submit refuses a claim naming a plaintext host it did not choose", async () => {
    // A claim file is a thing on disk that some other process may have
    // written, and submit hands a working credential to whatever it names.
    const forged = join(scratch, "forged-claim.json");
    writeFileSync(
      forged,
      JSON.stringify({
        version: 1,
        host: "http://komodo.attacker.test",
        workerId: "api-key:x:y",
        jobId: "acme/api#1@" + headSha,
        headSha,
        prId: "acme/api#1",
        repoId: "acme/api",
        number: 1,
        url: "https://github.com/acme/api/pull/1",
        title: "t",
        author: "a",
        claimedAt: Date.now(),
      }),
    );
    const resultPath = join(scratch, "result.json");
    writeFileSync(resultPath, JSON.stringify({ result: record.result }, null, 2));

    assert.throws(
      () =>
        cli(["submit", forged, resultPath], {
          HOME: scratch,
          KOMODO_API_KEY: secret,
          cwd: repoDir,
        }),
      /clear text/,
    );
  });

  await check("submit will not send a saved key to a deployment it was not saved for", async () => {
    const foreign = join(scratch, "foreign-claim.json");
    writeFileSync(
      foreign,
      JSON.stringify({
        version: 1,
        host: "https://komodo.elsewhere.test",
        workerId: "api-key:x:y",
        jobId: "acme/api#1@" + headSha,
        headSha,
        prId: "acme/api#1",
        repoId: "acme/api",
        number: 1,
        url: "https://github.com/acme/api/pull/1",
        title: "t",
        author: "a",
        claimedAt: Date.now(),
      }),
    );
    const resultPath = join(scratch, "result.json");

    // The environment variable is bound to the host its companion names, so a
    // claim pointing somewhere else does not get to read it.
    assert.throws(
      () =>
        cli(["submit", foreign, resultPath], {
          HOME: scratch,
          KOMODO_HOST: origin,
          KOMODO_API_KEY: secret,
          cwd: repoDir,
        }),
      /No API key for https:\/\/komodo\.elsewhere\.test/,
    );
  });

  await check("a Postgres URL with no host is redirected to the HTTP path", () => {
    assert.throws(
      () => cli(["claim", "--db", "postgres://localhost/komodo"], { HOME: mkdtempSync(join(tmpdir(), "empty-")) }),
      /over HTTP/,
    );
  });

  if (failures) throw new Error(`${failures} remote-submit assertion(s) failed`);
  console.log("remote submit E2E passed");
} catch (error) {
  if (logs) console.error(`\n--- deployment output ---\n${logs.trim()}\n--- end ---`);
  throw error;
} finally {
  await stopChild();
  rmSync(scratch, { recursive: true, force: true });
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function check(name, body) {
  const settle = (err) => {
    if (err) {
      failures++;
      console.error(`✗ ${name}\n  ${err.message.split("\n")[0]}`);
    } else {
      console.log(`✓ ${name}`);
    }
  };
  try {
    await body();
    settle(null);
  } catch (err) {
    settle(err);
  }
}

function seedGitRepo() {
  mkdirSync(repoDir, { recursive: true });
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Komodo E2E",
        GIT_AUTHOR_EMAIL: "e2e@example.com",
        GIT_COMMITTER_NAME: "Komodo E2E",
        GIT_COMMITTER_EMAIL: "e2e@example.com",
      },
    });
  git("init", "--initial-branch=main", "-q");
  writeFileSync(join(repoDir, "session.ts"), "export const ttl = 900;\n");
  git("add", ".");
  git("commit", "-qm", "base");
  git("checkout", "-qb", "feature");
  writeFileSync(join(repoDir, "session.ts"), "export const ttl = 900;\nexport const revoke = () => {};\n");
  git("add", ".");
  git("commit", "-qm", "revoke sessions");
  return git("rev-parse", "HEAD").trim();
}

function pullRequest(number, headSha) {
  return {
    repoId: "acme/api",
    number,
    title: "Revoke sessions on logout",
    author: "renata",
    url: `https://github.com/acme/api/pull/${number}`,
    headSha,
    state: "open",
    isDraft: false,
    requestedReviewers: [],
    approvals: [],
    changesRequested: [],
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mergedAt: null,
  };
}

/** Another API key on the same deployment, for the cross-key tests. */
async function mintKey() {
  const store = new SqliteStore({ path: db });
  try {
    const minted = mintApiKey();
    await store.createApiKey({ name: "other", keyHash: minted.keyHash, prefix: minted.prefix });
    return minted.secret;
  } finally {
    store.close();
  }
}

async function seedStore(headSha) {
  const store = new SqliteStore({ path: db });
  try {
    await store.setOrganization({
      slug: "acme",
      name: "Acme",
      role: "admin",
      trialEndsAt: 0,
      plan: "pro",
    });
    await store.upsertRepository({
      id: "acme/api",
      owner: "acme",
      name: "api",
      provider: "github",
      enabled: true,
      reviewCount: 0,
    });
    for (const number of [1, 2]) {
      await store.upsertPullRequest(pullRequest(number, headSha));
      await store.requestAIReview({
        prId: `acme/api#${number}`,
        headSha,
        trigger: "new_pull_request",
        requestedAt: Date.now(),
      });
    }

    const minted = mintApiKey();
    await store.createApiKey({ name: "e2e", keyHash: minted.keyHash, prefix: minted.prefix });
    return minted.secret;
  } finally {
    store.close();
  }
}

function reviewRecord(headSha) {
  return {
    version: 3,
    id: `acme-api-1-${Date.now()}`,
    createdAt: new Date().toISOString(),
    provider: "claude-skill",
    pr: {
      owner: "acme",
      repo: "api",
      number: 1,
      title: "Revoke sessions on logout",
      author: "renata",
      url: "https://github.com/acme/api/pull/1",
      baseRef: "main",
      headRef: "feature",
      headSha,
    },
    files: [
      {
        path: "session.ts",
        additions: 1,
        deletions: 0,
        status: "modified",
        patch: "@@ -1 +1,2 @@\n+export const revoke = () => {};",
      },
    ],
    result: {
      summary: "- Adds a session revocation hook",
      walkthrough: [{ files: ["session.ts"], summary: "Adds revoke()." }],
      confidence: 3,
      effort: 2,
      verdict: "Ships once the cache question is settled.",
      verificationChecks: [
        {
          title: "Logging out ends the session everywhere",
          instruction: "Log in on two devices, log out on one, reload the other.",
          expectedResult: "The second device is signed out.",
          evidenceKinds: ["manual_observation"],
          required: true,
        },
      ],
      judgements: [
        {
          path: "session.ts",
          line: 2,
          severity: "major",
          kind: "Risk",
          focus: "architecture",
          tag: "changes how logging out works",
          title: "Sessions outlive logout by up to fifteen minutes.",
          lede: "The token is revoked in the store but the edge cache keeps serving it.",
          detail: "Revoking the cache entry costs one extra round trip.",
          ask: "Is a fifteen-minute window acceptable here?",
          sources: ["the diff"],
          sourceNote: "The diff revokes in the store only.",
          code: "session.ts:2 export const revoke",
          options: [
            { label: "Yes — fifteen minutes is fine", bucket: "Agreed" },
            { label: "No — revoke the cache entry", bucket: "Blocks" },
            { label: "I have a question first", bucket: "Asked" },
            { label: "Not my call", bucket: "Passed on" },
          ],
          fixPrompt: "Revoke the edge cache entry alongside the store token.",
        },
      ],
    },
    posted: false,
  };
}

function startDeployment(port) {
  const proc = spawn(
    process.execPath,
    [
      join(root, "packages/cli/dist/index.js"),
      "dev",
      "--no-poll",
      "--no-seed",
      "--port",
      String(port),
      "--db",
      db,
    ],
    {
      cwd: scratch,
      env: {
        ...process.env,
        NO_COLOR: "1",
        HOSTNAME: "127.0.0.1",
        KOMODO_SEED: "0",
        // The deployment no longer takes its own name from the request, so an
        // operator has to say it. This is that setting.
        KOMODO_PUBLIC_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const capture = (chunk) => {
    logs = `${logs}${chunk.toString()}`.slice(-64 * 1024);
  };
  proc.stdout.on("data", capture);
  proc.stderr.on("data", capture);
  proc.once("exit", () => {
    childExited = true;
  });
  return proc;
}

function cli(args, env = {}) {
  const { cwd, ...vars } = env;
  return execFileSync(process.execPath, [join(root, "packages/cli/dist/index.js"), ...args], {
    cwd: cwd ?? scratch,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", KOMODO_DB: "", ...vars },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function api(origin, secret, method, path, body) {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body: parsed };
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (childExited) throw new Error(`the deployment exited before answering\n${logs}`);
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastError = new Error(`health answered ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError ?? new Error("the deployment never became healthy");
}

async function stopChild() {
  if (!child || childExited) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
