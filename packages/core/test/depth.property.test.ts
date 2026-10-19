import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { DepthRule, KomodoConfig } from "../src/config.js";
import { REVIEW_DEPTHS } from "../src/depth.js";
import { resolveDepth, type DepthRequest, type DepthSubject } from "../src/depth-rules.js";

const RUNS = { seed: 20261017, numRuns: 300 };

const depth = fc.constantFrom(...REVIEW_DEPTHS);

const seg = fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/);
const filePath = fc.array(seg, { minLength: 1, maxLength: 3 }).map((s) => s.join("/"));

const file = fc.record({
  path: filePath,
  additions: fc.nat({ max: 200 }),
  deletions: fc.nat({ max: 200 }),
});

const label = fc.stringMatching(/^[a-z][a-z0-9-]{0,9}$/);

const subject: fc.Arbitrary<DepthSubject> = fc.record({
  files: fc.array(file, { maxLength: 15 }),
  labels: fc.array(label, { maxLength: 5 }),
});

const depthRule: fc.Arbitrary<DepthRule> = fc.oneof(
  fc.record({ depth, files: fc.integer({ min: 1, max: 500 }) }),
  fc.record({ depth, lines: fc.integer({ min: 1, max: 2000 }) }),
  fc.record({ depth, path: fc.stringMatching(/^[a-z][a-z0-9_/*-]{0,19}$/) }),
  fc.record({ depth, label }),
);

const config: fc.Arbitrary<Pick<KomodoConfig, "depth">> = fc.record({
  depth: fc.record({
    default: depth,
    rules: fc.array(depthRule, { maxLength: 6 }),
  }),
});

const request: fc.Arbitrary<DepthRequest> = fc.record({
  depth,
  by: fc.option(fc.constantFrom("alice", "bob"), { nil: null }),
});

/** Fisher-Yates with a seeded index stream from fast-check, so the shuffle itself is deterministic. */
function shuffled<T>(xs: T[], draws: number[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = draws[i % draws.length] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("resolveDepth", () => {
  it("an explicit request always decides the result, regardless of rules", () => {
    fc.assert(
      fc.property(config, subject, request, (cfg, subj, req) => {
        const decision = resolveDepth(cfg, subj, req);
        expect(decision.depth).toBe(req.depth);
      }),
      RUNS,
    );
  });

  it("the depth chosen (with no request) does not depend on the order of subject.files", () => {
    // Only `.depth` is compared, not `.reason`: a path/label rule's reason
    // quotes whichever matching file or label `Array.find` reaches first, and
    // that can legitimately differ when several files match the same rule and
    // the order changes. `resolveDepth`'s own doc comment promises the winning
    // depth is order-independent ("the deepest matching rule wins"); it makes
    // no promise about which matching file's name ends up in the sentence.
    fc.assert(
      fc.property(config, subject, fc.array(fc.nat(), { minLength: 1, maxLength: 20 }), (cfg, subj, draws) => {
        const a = resolveDepth(cfg, subj, null);
        const b = resolveDepth(cfg, { ...subj, files: shuffled(subj.files, draws) }, null);
        expect(a.depth).toBe(b.depth);
      }),
      RUNS,
    );
  });

  // Not tested: "adding a file never lowers the depth." depth-rules.ts's own
  // doc comment promises only that "no rule can take a review below the
  // default — a rule is a reason to spend more, never less," which is a
  // statement about requests vs. rules, not about growing the file set. It
  // never promises monotonicity in the number of files. (By construction
  // today's four rule kinds — files/lines counts and path/label existence
  // checks over the current file set — happen to be monotonic in file count,
  // but that is an implementation detail resolveDepth's contract does not
  // make, so a future rule kind could break it without breaking any promise
  // this module states.)
});
