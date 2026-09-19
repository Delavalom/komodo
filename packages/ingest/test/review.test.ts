/**
 * The skip rules, and who they still apply to.
 *
 * Every one of these was config the parser accepted and no code read, so the
 * tests are as much a record of what the settings now mean as a guard on the
 * predicate. The `reviewPending` block below is about the other half: the rules
 * are enforced at enqueue time now, so what the worker checks is the difference
 * between work Komodo started and work a person asked for.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  KomodoConfigSchema,
  type GitHubClient,
  type KomodoConfig,
  type ReviewInput,
  type ReviewProvider,
  type ReviewResult,
} from "@komodo/core";
import { META_CONTEXT_SOURCES, type PullRequest, type SharedContextRecord } from "@komodo/store";
import { SqliteStore } from "@komodo/store/sqlite";

import {
  automaticEligibility,
  hardLimits,
  reviewPending,
  shouldReview,
} from "../src/review.js";

const config = (over: Record<string, unknown> = {}): KomodoConfig =>
  KomodoConfigSchema.parse(over);

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  id: "acme/api#1",
  repoId: "acme/api",
  number: 1,
  title: "Add rate limiting",
  author: "renata",
  url: "https://github.com/acme/api/pull/1",
  headSha: "aaa111",
  state: "open",
  isDraft: false,
  requestedReviewers: [],
  approvals: [],
  changesRequested: [],
  additions: 40,
  deletions: 3,
  changedFiles: 2,
  createdAt: 0,
  updatedAt: 0,
  mergedAt: null,
  checks: null,
  ...over,
});

describe("shouldReview", () => {
  it("reviews an ordinary open pull request", () => {
    expect(shouldReview(pr(), config()).skip).toBe(false);
  });

  it("skips a draft by default, and reviews one when told to", () => {
    expect(shouldReview(pr({ isDraft: true }), config()).skip).toBe(true);
    expect(
      shouldReview(pr({ isDraft: true }), config({ auto_review: { drafts: true } })).skip,
    ).toBe(false);
  });

  it("skips a title carrying an ignore keyword, case-insensitively", () => {
    const result = shouldReview(pr({ title: "wip: spike on caching" }), config());
    expect(result.skip).toBe(true);
    expect(result.skip && result.reason).toContain("WIP");
  });

  it("does not treat an empty keyword as matching every title", () => {
    // "".includes() is true for any string, which would skip everything.
    const cfg = config({ auto_review: { ignore_title_keywords: ["", "  "] } });
    expect(shouldReview(pr(), cfg).skip).toBe(false);
  });

  it("skips a filtered author", () => {
    const cfg = config({
      auto_review: { authors: { mode: "exclude", tokens: ["dependabot[bot]"] } },
    });
    expect(shouldReview(pr({ author: "dependabot[bot]" }), cfg).skip).toBe(true);
    expect(shouldReview(pr({ author: "renata" }), cfg).skip).toBe(false);
  });

  it("matches an author regardless of case", () => {
    const cfg = config({
      auto_review: { authors: { mode: "exclude", tokens: ["Dependabot[bot]"] } },
    });
    expect(shouldReview(pr({ author: "dependabot[bot]" }), cfg).skip).toBe(true);
  });

  it("inverts the filter in include mode", () => {
    const cfg = config({
      auto_review: { authors: { mode: "include", tokens: ["renata"] } },
    });
    expect(shouldReview(pr({ author: "renata" }), cfg).skip).toBe(false);
    expect(shouldReview(pr({ author: "marco" }), cfg).skip).toBe(true);
  });

  it("ignores an empty token list rather than skipping everyone", () => {
    const cfg = config({ auto_review: { authors: { mode: "include", tokens: [] } } });
    expect(shouldReview(pr(), cfg).skip).toBe(false);
  });

  it("skips a pull request over the file cap", () => {
    const cfg = config({ auto_review: { max_files: 50 } });
    expect(shouldReview(pr({ changedFiles: 400 }), cfg).skip).toBe(true);
    expect(shouldReview(pr({ changedFiles: 50 }), cfg).skip).toBe(false);
  });

  it("treats a cap of 0 as no cap", () => {
    const cfg = config({ auto_review: { max_files: 0 } });
    expect(shouldReview(pr({ changedFiles: 5000 }), cfg).skip).toBe(false);
  });

  it("says why, so the queue can explain itself", () => {
    const result = shouldReview(pr({ isDraft: true }), config());
    expect(result.skip && result.reason).toBe("draft");
  });
});

/**
 * What a person asking for a review can and cannot override.
 *
 * The noise filters exist so Komodo does not start work nobody wanted. None of
 * them is a reason to refuse someone who pressed the button — that would be a
 * control that does nothing. The file cap is different: it is about a review
 * that cannot be done well at any price.
 */
describe("hardLimits", () => {
  it("allows what the automatic filters would have passed over", () => {
    const cfg = config({
      auto_review: {
        authors: { mode: "include", tokens: ["renata"] },
        ignore_title_keywords: ["WIP"],
      },
    });
    const asked = pr({ author: "marco", title: "WIP: caching", isDraft: true });

    expect(automaticEligibility(asked, cfg).skip).toBe(true);
    expect(hardLimits(asked, cfg).skip).toBe(false);
  });

  it("still refuses a pull request over the file cap", () => {
    const cfg = config({ auto_review: { max_files: 50 } });
    expect(hardLimits(pr({ changedFiles: 400 }), cfg).skip).toBe(true);
  });
});

describe("reviewPending", () => {
  const result: ReviewResult = {
    summary: "- Adds a rate limiter.",
    walkthrough: [],
    confidence: 4,
    verdict: "Read the limiter and its tests.",
    effort: 2,
    verificationChecks: [],
    judgements: [],
  };

  function harness() {
    const provider: ReviewProvider = {
      name: "fake",
      async review() {
        return result;
      },
    };
    const reviewed: number[] = [];
    const github = {
      async getPR(ref: { owner: string; repo: string; number: number }) {
        reviewed.push(ref.number);
        return {
          ...ref,
          title: "Add rate limiting",
          body: "",
          author: "marco",
          url: "https://github.com/acme/api/pull/1",
          baseRef: "main",
          headRef: "limits",
          headSha: "aaa111",
          isDraft: false,
          labels: [],
        };
      },
      async listFiles() {
        return [
          { path: "src/limit.ts", status: "modified", additions: 40, deletions: 3 },
        ];
      },
    } as unknown as GitHubClient;
    return { provider, github, reviewed };
  }

  async function storeWith(
    over: Partial<PullRequest>,
    trigger: "manual" | "new_pull_request",
  ) {
    const store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api",
      provider: "github", enabled: true, reviewCount: 0,
    });
    const row = pr(over);
    await store.upsertPullRequest(row);
    await store.requestAIReview({
      prId: row.id,
      headSha: row.headSha,
      trigger,
      requestedAt: 1,
    });
    return store;
  }

  /** The queue's Review with AI button, on a pull request nothing would pick. */
  it("reviews what a person asked for over the automatic filters", async () => {
    const store = await storeWith(
      { author: "marco", title: "WIP: caching", isDraft: true },
      "manual",
    );
    const { provider, github, reviewed } = harness();

    const pass = await reviewPending({
      store,
      github,
      provider,
      config: config({
        auto_review: { authors: { mode: "include", tokens: ["renata"] } },
      }),
    });

    expect(pass).toMatchObject({ reviewed: 1, skipped: 0, failed: 0 });
    expect(reviewed).toEqual([1]);
  });

  it("refuses even an explicit request over the file cap", async () => {
    const store = await storeWith({ changedFiles: 400 }, "manual");
    const { provider, github, reviewed } = harness();

    const pass = await reviewPending({
      store,
      github,
      provider,
      config: config({ auto_review: { max_files: 50 } }),
    });

    expect(pass).toMatchObject({ reviewed: 0, skipped: 1 });
    expect(reviewed).toEqual([]);
  });

  /**
   * The poller filters before it enqueues, so this is a setting that changed
   * between the enqueue and the claim — rare, and still not worth a model run.
   */
  it("re-checks an automatic job against the settings of the moment", async () => {
    const store = await storeWith({ isDraft: true }, "new_pull_request");
    const { provider, github, reviewed } = harness();

    const pass = await reviewPending({ store, github, provider, config: config() });

    expect(pass).toMatchObject({ reviewed: 0, skipped: 1 });
    expect(reviewed).toEqual([]);
  });
});

describe("reviewPending — shared context", () => {
  const result: ReviewResult = {
    summary: "- Adds a rate limiter.",
    walkthrough: [],
    confidence: 4,
    verdict: "Read the limiter and its tests.",
    effort: 2,
    verificationChecks: [],
    judgements: [],
  };

  const dirs: string[] = [];
  const tree = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-review-context-"));
    dirs.push(dir);
    for (const [path, body] of Object.entries(files)) {
      writeFileSync(join(dir, path), body);
    }
    return dir;
  };
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function harness() {
    const inputs: ReviewInput[] = [];
    const provider: ReviewProvider = {
      name: "fake",
      async review(input) {
        inputs.push(input);
        return result;
      },
    };
    const github = {
      async getPR(ref: { owner: string; repo: string; number: number }) {
        return {
          ...ref,
          title: "Add rate limiting",
          body: "",
          author: "marco",
          url: "https://github.com/acme/api/pull/1",
          baseRef: "main",
          headRef: "limits",
          headSha: "aaa111",
          isDraft: false,
          labels: [],
        };
      },
      async listFiles() {
        return [
          { path: "src/limit.ts", status: "modified", additions: 40, deletions: 3 },
        ];
      },
    } as unknown as GitHubClient;
    return { provider, github, inputs };
  }

  async function storeWith(over: Partial<PullRequest> = {}) {
    const store = new SqliteStore({ path: ":memory:" });
    await store.upsertRepository({
      id: "acme/api", owner: "acme", name: "api",
      provider: "github", enabled: true, reviewCount: 0,
    });
    const row = pr(over);
    await store.upsertPullRequest(row);
    await store.requestAIReview({
      prId: row.id,
      headSha: row.headSha,
      trigger: "manual",
      requestedAt: 1,
    });
    return store;
  }

  it("hands an unscoped shared context document to the provider", async () => {
    const dir = tree({ "rules.md": "Never bypass rate limiting in a handler." });
    const store = await storeWith();
    const { provider, github, inputs } = harness();

    await reviewPending({
      store,
      github,
      provider,
      config: config({ context: { sources: [{ type: "path", path: dir }] } }),
      configDir: "/",
    });

    expect(inputs).toHaveLength(1);
    expect(inputs[0].sharedContext?.[0]?.text).toContain("Never bypass rate limiting");
  });

  it("only hands over a cluster-scoped document when the repo is in that cluster", async () => {
    const dir = tree({
      "cluster.md": "---\nclusters: [payments]\n---\nOnly payments repos see this.",
    });
    const store = await storeWith();
    const { provider, github, inputs } = harness();
    const cfg = config({ context: { sources: [{ type: "path", path: dir }] } });

    await reviewPending({ store, github, provider, config: cfg, configDir: "/" });
    expect(inputs[0].sharedContext ?? []).toHaveLength(0);

    await store.saveRepoCluster({ name: "payments", memberRepoIds: ["acme/api"] });
    await store.requestAIReview({ prId: "acme/api#1", headSha: "aaa111", trigger: "manual", requestedAt: 2 });
    await reviewPending({ store, github, provider, config: cfg, configDir: "/" });
    expect(inputs[1].sharedContext).toHaveLength(1);
  });

  it("still reviews when a configured source directory is missing", async () => {
    const store = await storeWith();
    const { provider, github, inputs } = harness();

    const pass = await reviewPending({
      store,
      github,
      provider,
      config: config({ context: { sources: [{ type: "path", path: "/does/not/exist" }] } }),
      configDir: "/",
    });

    expect(pass).toMatchObject({ reviewed: 1, failed: 0 });
    expect(inputs[0].sharedContext ?? []).toHaveLength(0);
  });

  it("records what it resolved under the context-sources meta key", async () => {
    const dir = tree({ "rules.md": "Body." });
    const store = await storeWith();
    const { provider, github } = harness();

    await reviewPending({
      store,
      github,
      provider,
      config: config({ context: { sources: [{ type: "path", path: dir }] } }),
      configDir: "/",
    });

    const raw = await store.getMeta(META_CONTEXT_SOURCES);
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw!) as SharedContextRecord;
    expect(record.sources[0].ok).toBe(true);
    expect(record.sources[0].files[0].path).toBe("rules.md");
    // Bodies never travel into the record.
    expect(JSON.stringify(record)).not.toContain("Body.");
  });
});
