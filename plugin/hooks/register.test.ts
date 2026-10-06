/**
 * The komodo mod, with the CLI answered beneath it: every `process.run` the
 * mod makes is answered here with what `komodo-review` prints, so nothing on
 * the host runs and each refusal path is reachable.
 */
import type { On } from "claude-code";
import { describe, expect, mock, test } from "claude-code/testing";

const CLAIM = {
  claimPath: "/w/.komodo/claims/job-1.json",
  claim: {
    repoId: "acme/api",
    number: 7,
    title: "Add rate limit",
    url: "https://github.com/acme/api/pull/7",
    headSha: "a".repeat(40),
  },
  leaseExpiresAt: 7_200_000,
  checkedOut: true,
};
const PROMPT = {
  prompt: "REVIEW PROMPT",
  schema: { type: "object", properties: { summary: { type: "string" } } },
};

/** What `$.process.run` resolves with, as an op answered beneath the plugin. */
const ran = (exitCode: number, stdout: string, stderr: string) => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
});
const ok = (value: unknown) => ran(0, `${JSON.stringify(value)}\n`, "");
const fail = (stderr: string) => ran(1, "", stderr);

const START = { cwd: "/w", surface: "terminal", isInteractive: true } as const;

/** `/command args` as the person typing it at the prompt would raise it. */
const typed = (command: string, args = "") => ({
  command,
  args,
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const);

/** The engine beneath the mod: what it registers, queues and shows, recorded. */
function world(on: On) {
  const seen = { tools: [] as string[], prompts: [] as string[], status: [] as (string | undefined)[] };
  const clock = mock.clock(on, { now: 0 });
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("tool.register", (_$, e) => {
    seen.tools.push(e.name);
    return { value: { tool: `mcp__komodo__${e.name}` } };
  });
  on("prompt.submit", (_$, e) => {
    seen.prompts.push(e.text);
    return { text: e.text };
  });
  on("ui.status", (_$, e) => {
    seen.status.push(e.text);
    return { value: undefined };
  });
  return { seen, clock };
}

describe("komodo mod", () => {
  test("claims, checks out, offers submit_review and queues the review", async ($, on) => {
    const { seen, clock } = world(on);
    const argvs: string[][] = [];
    on("process.run", (_$, e) => {
      argvs.push([...e.argv]);
      return e.argv.includes("claim") ? ok(CLAIM) : ok(PROMPT);
    });

    await $.session.start(START);
    const out = await $.command.run(typed("komodo-claim"));

    expect(argvs[0]?.slice(-3)).toEqual(["claim", "--checkout", "--json"]);
    expect(argvs[1]?.slice(-2)).toEqual(["prompt", "--json"]);
    expect(out.text).toMatch(/acme\/api#7/);
    expect(out.context?.[0]).toMatch(/REVIEW PROMPT/);
    expect(out.context?.[0]).toMatch(/submit_review/);
    expect(seen.tools).toEqual(["submit_review"]);
    expect(seen.status.at(-1)).toBe("Komodo · acme/api#7 · 2h 0m left");

    await clock.advance(0);
    expect(seen.prompts).toEqual([
      "Review the Komodo job claimed above (acme/api#7) and finish with submit_review.",
    ]);
  });

  test("resumes a claim file it is given", async ($, on) => {
    world(on);
    const argvs: string[][] = [];
    on("process.run", (_$, e) => {
      argvs.push([...e.argv]);
      return e.argv.includes("checkout") ? ok(CLAIM) : ok(PROMPT);
    });

    await $.session.start(START);
    await $.command.run(typed("komodo-claim", "/w/c.json"));

    expect(argvs[0]?.slice(-3)).toEqual(["checkout", "/w/c.json", "--json"]);
  });

  test("says so when nothing is queued", async ($, on) => {
    world(on);
    on("process.run", () => ok({ claimPath: null }));
    await $.session.start(START);
    const out = await $.command.run(typed("komodo-claim"));
    expect(out.text).toBe("No AI review job is queued.");
  });

  test("passes the CLI's refusal through, claim path and all", async ($, on) => {
    world(on);
    on("process.run", () =>
      fail(
        "Claimed acme/api#7 (claim file: /w/c.json), but did not check it out. The claim is for acme/api, but this checkout is acme/web.",
      ),
    );
    await $.session.start(START);
    const out = await $.command.run(typed("komodo-claim"));
    expect(out.text).toMatch(/claim file: \/w\/c\.json/);
  });

  test("submit_review pipes the input to submit and clears the job", async ($, on) => {
    world(on);
    let stdin = "";
    on("process.run", (_$, e) => {
      if (e.argv.includes("submit")) {
        stdin = e.init?.stdin ?? "";
        return ok({ reviewId: "rev-1", recordPath: "/w/.komodo/reviews/rev-1.json" });
      }
      return e.argv.includes("claim") ? ok(CLAIM) : ok(PROMPT);
    });

    await $.session.start(START);
    await $.command.run(typed("komodo-claim"));
    const res = await $.tool.call({ tool: "mcp__komodo__submit_review", summary: "- x" });

    expect(JSON.parse(stdin)).toEqual({ summary: "- x" });
    expect(String(res.result)).toMatch(/rev-1/);
    const after = await $.command.run(typed("komodo-job"));
    expect(after.text).toMatch(/No Komodo job is claimed/);
  });

  test("a refused result goes back to the model as an error and keeps the job", async ($, on) => {
    world(on);
    on("process.run", (_$, e) => {
      if (e.argv.includes("submit")) {
        return fail("summary: Too small: expected string to have >=1 characters");
      }
      return e.argv.includes("claim") ? ok(CLAIM) : ok(PROMPT);
    });

    await $.session.start(START);
    await $.command.run(typed("komodo-claim"));
    const res = await $.tool.call({ tool: "mcp__komodo__submit_review", summary: "" });

    expect(res.deny ?? res.text).toMatch(/Too small/);
    const after = await $.command.run(typed("komodo-job"));
    expect(after.text).toMatch(/acme\/api#7/);
  });

  test("submit_review without a claim is refused", async ($, on) => {
    world(on);
    await $.session.start(START);
    const res = await $.tool.call({ tool: "mcp__komodo__submit_review" });
    expect(res.deny ?? res.text).toMatch(/komodo-claim/);
  });

  test("forget clears the job and says the lease still runs", async ($, on) => {
    world(on);
    on("process.run", (_$, e) => (e.argv.includes("claim") ? ok(CLAIM) : ok(PROMPT)));

    await $.session.start(START);
    await $.command.run(typed("komodo-claim"));
    const out = await $.command.run(typed("komodo-job", "forget"));

    expect(out.text).toMatch(/lease still runs/);
    const after = await $.command.run(typed("komodo-job"));
    expect(after.text).toMatch(/No Komodo job is claimed/);
  });
});
