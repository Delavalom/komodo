/**
 * What a commit's checks add up to.
 *
 * This is the number a reviewer decides on at a glance, which makes every
 * wrong answer here expensive in a particular way: a red build on a green
 * commit wastes someone's afternoon, and a green one on a red commit is worse.
 * So the cases below are mostly about what happens when GitHub says something
 * this client was not written for.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GitHubClient } from "../src/github.js";

const HEAD = "aaa111";

/** Queue one response per fetch call, in order. */
function respond(...bodies: unknown[]): { calls: () => number } {
  let call = 0;
  const fetcher = vi.fn(async () => {
    const body = bodies[Math.min(call, bodies.length - 1)];
    call++;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return { calls: () => fetcher.mock.calls.length };
}

/** A repository page holding one open pull request with the given rollup. */
function page(state: string | null, over: Record<string, unknown> = {}) {
  return {
    data: {
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage: false, endCursor: null, ...(over.pageInfo ?? {}) },
          nodes: [
            {
              number: 7,
              commits: {
                nodes: [
                  {
                    commit: {
                      oid: HEAD,
                      statusCheckRollup: state === null ? null : { state },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  };
}

/** A commit's contexts, as the detail query returns them. */
function detail(contexts: unknown[], totalCount?: number) {
  return {
    data: {
      repository: {
        object: {
          statusCheckRollup: {
            contexts: { totalCount: totalCount ?? contexts.length, nodes: contexts },
          },
        },
      },
    },
  };
}

const run = (conclusion: string | null, name = "build", status = "COMPLETED") => ({
  __typename: "CheckRun",
  name,
  conclusion,
  status,
});

const status = (state: string, context = "ci/legacy") => ({
  __typename: "StatusContext",
  context,
  state,
});

const client = () => new GitHubClient("token");

afterEach(() => vi.unstubAllGlobals());

describe("check rollups", () => {
  it("reads GitHub's own rollup state, which is what the column shows", async () => {
    for (const [given, expected] of [
      ["SUCCESS", "passing"],
      ["FAILURE", "failing"],
      ["ERROR", "failing"],
      ["PENDING", "pending"],
      ["EXPECTED", "pending"],
    ] as const) {
      respond(page(given));
      const rollups = await client().checkRollups("acme", "api");
      expect(rollups.get(7)?.state, given).toBe(expected);
    }
  });

  it("says a commit with no checks has none, rather than saying it is green", async () => {
    respond(page(null));
    const rollups = await client().checkRollups("acme", "api");
    expect(rollups.get(7)?.state).toBe("neutral");
  });

  it("calls a state it has never seen pending, not failing", async () => {
    // "These pass, everything else fails" turns one new GitHub enum value into
    // a red build on every affected pull request.
    respond(page("SOME_FUTURE_STATE"));
    const rollups = await client().checkRollups("acme", "api");
    expect(rollups.get(7)?.state).toBe("pending");
  });

  it("asks for no check contexts, because they are what made it expensive", async () => {
    // GitHub prices a query from its connection arguments before running it.
    // `contexts(first: 100)` under `pullRequests(first: 100)` scores 102 points
    // against an hourly budget of 5,000 — one repository, once a minute, would
    // have spent the lot.
    respond(page("SUCCESS"));
    await client().checkRollups("acme", "api");

    const body = JSON.parse(String((globalThis.fetch as any).mock.calls[0][1].body));
    expect(body.query).not.toMatch(/contexts\(/);
    expect(body.query).toMatch(/statusCheckRollup \{ state \}/);
  });

  it("pins each rollup to the commit it describes", async () => {
    respond(page("SUCCESS"));
    const rollups = await client().checkRollups("acme", "api");
    expect(rollups.get(7)?.headSha).toBe(HEAD);
  });

  it("stops paging when the cursor is null, however hasNextPage reads", async () => {
    // A truthy hasNextPage with no endCursor re-requests page one — ten times,
    // at full price, making no progress.
    const { calls } = respond(
      page("SUCCESS", { pageInfo: { hasNextPage: true, endCursor: null } }),
    );
    await client().checkRollups("acme", "api");
    expect(calls()).toBe(1);
  });

  it("answers an invisible repository with nothing rather than an exception", async () => {
    respond({
      data: { repository: null },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository named acme/api." }],
    });
    expect((await client().checkRollups("acme", "api")).size).toBe(0);
  });

  it("keeps the rollups it did get when one node was forbidden", async () => {
    // GitHub commonly answers 200 with good data and a per-node error.
    respond({
      ...page("SUCCESS"),
      errors: [{ type: "FORBIDDEN", message: "Resource not accessible" }],
    });
    expect((await client().checkRollups("acme", "api")).get(7)?.state).toBe("passing");
  });

  it("raises anything else, so a broken pass is not silently an empty one", async () => {
    respond({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] });
    await expect(client().checkRollups("acme", "api")).rejects.toThrow(/rate limit/i);
  });

  it("skips a node with no commit or no number rather than storing a hole", async () => {
    respond({
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              { number: 1, commits: { nodes: [] } },
              { commits: { nodes: [{ commit: { oid: "x", statusCheckRollup: null } }] } },
              null,
            ],
          },
        },
      },
    });
    expect((await client().checkRollups("acme", "api")).size).toBe(0);
  });
});

describe("the failing checks on a commit", () => {
  const failingFor = async (contexts: unknown[], totalCount?: number) => {
    respond(detail(contexts, totalCount));
    return client().failingChecks("acme", "api", HEAD);
  };

  it("names what broke", async () => {
    const result = await failingFor([
      run("SUCCESS", "unit"),
      run("FAILURE", "build"),
      status("ERROR", "ci/deploy"),
    ]);
    expect(result).toMatchObject({ state: "failing", failed: 2, passed: 1, total: 3 });
    expect(result?.failing).toEqual(["build", "ci/deploy"]);
  });

  it("counts skipped and neutral runs as passed, not as work still to do", async () => {
    const result = await failingFor([run("SKIPPED"), run("NEUTRAL", "lint")]);
    expect(result).toMatchObject({ state: "passing", passed: 2, pending: 0 });
  });

  it("treats every real failure conclusion as a failure", async () => {
    for (const conclusion of [
      "FAILURE",
      "TIMED_OUT",
      "CANCELLED",
      "ACTION_REQUIRED",
      "STARTUP_FAILURE",
    ]) {
      const result = await failingFor([run(conclusion)]);
      expect(result, conclusion).toMatchObject({ state: "failing", failed: 1 });
    }
  });

  it("ignores a run GitHub has superseded", async () => {
    // STALE means a newer run replaced this one. GitHub leaves it out of its
    // own rollup, and counting it as a failure puts a red build on a pull
    // request nothing is wrong with.
    const result = await failingFor([run("SUCCESS", "unit"), run("STALE", "old-build")]);
    expect(result).toMatchObject({ state: "passing", total: 1, failed: 0 });
  });

  it("calls a conclusion it has never seen pending, not failing", async () => {
    const result = await failingFor([run("SOME_FUTURE_CONCLUSION")]);
    expect(result).toMatchObject({ state: "pending", pending: 1, failed: 0 });
    expect(result?.failing).toEqual([]);
  });

  it("does not trust a conclusion on a run that has not completed", async () => {
    const result = await failingFor([run("SUCCESS", "build", "QUEUED")]);
    expect(result).toMatchObject({ state: "pending", passed: 0 });
  });

  it("counts a context type it does not understand rather than dropping it", async () => {
    const result = await failingFor([{ __typename: "SomethingNew" }]);
    expect(result).toMatchObject({ state: "pending", total: 1 });
  });

  it("will not call a truncated list passing", async () => {
    // Nothing here can say what is in the fifty contexts it did not read, and
    // "passing" is the one answer that must never be given on partial data.
    const result = await failingFor([run("SUCCESS"), run("SUCCESS", "lint")], 150);
    expect(result).toMatchObject({ state: "pending", passed: 2, pending: 148 });
  });

  it("deduplicates repeated check names", async () => {
    // GitHub genuinely repeats a context name — two workflows with the same
    // job name, or a re-run — and a list with repeats is one a UI cannot key.
    const result = await failingFor([run("FAILURE", "build"), run("FAILURE", "build")]);
    expect(result?.failing).toEqual(["build"]);
    expect(result?.failed).toBe(2);
  });

  it("reports nothing when the detail could not be read", async () => {
    respond({ data: { repository: { object: null } } });
    expect(await client().failingChecks("acme", "api", HEAD)).toBeNull();
  });
});
