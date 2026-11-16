import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  AACR_DATASETS,
  convertAacrRecord,
  ensureAacrDataset,
  normalizeLineRange,
  repoFromPrUrl,
  sampleAacrInstances,
  sha256,
  type AacrRecord,
} from "../../src/aacr/dataset.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** The same 30 synthetic records the Python converter was run on (see `expected` below). */
function syntheticRecords(): AacrRecord[] {
  const langs = ["Go", "C++", "Python", "Rust"];
  return Array.from({ length: 30 }, (_, i) => ({
    githubPrUrl: `https://github.com/org${i % 4}/repo${i}/pull/${i + 1}`,
    source_commit: i.toString(16).padStart(40, "0"),
    target_commit: [...((i + 1) * 7919).toString(16).padStart(40, "0")].reverse().join(""),
    project_main_language: i % 5 ? langs[(i * 7) % 4] : "Go",
    change_line_count: i,
    comments: [{ path: "a.py", note: `n${i}`, from_line: 1, to_line: 2, side: "right" }],
  }));
}

/**
 * Instance ids from `converters.aacr_bench.convert_file(input, output, limit, seed)`
 * in alibaba/aacr-bench@c99d126, run on `syntheticRecords()`.
 */
const expected: Record<string, string[]> = {
  "42:10": ["org3__repo19@caa6200", "org2__repo14@100d100", "org2__repo10@5445100", "org2__repo26@5334300", "org2__repo22@977c200", "org2__repo6@988d000", "org1__repo5@a99b000", "org0__repo12@3229100", "org3__repo11@4337100", "org3__repo15@0fee100"],
  "7:all": ["org1__repo21@a88a200", "org1__repo5@a99b000", "org3__repo15@0fee100", "org1__repo29@200a300", "org3__repo7@877f000", "org0__repo28@3118300", "org1__repo9@6553100", "org0__repo0@fee1000", "org1__repo13@211b100", "org0__repo8@7661100", "org3__repo27@4226300", "org2__repo22@977c200", "org2__repo26@5334300", "org2__repo14@100d100", "org3__repo23@866e200", "org0__repo24@7550300", "org3__repo19@caa6200", "org2__repo6@988d000", "org0__repo16@fdd0200", "org1__repo25@6442300", "org2__repo18@dbb4200", "org3__repo11@4337100", "org3__repo3@cbb7000", "org1__repo17@ecc2200", "org2__repo2@dcc5000", "org1__repo1@edd3000", "org0__repo20@b998200", "org0__repo12@3229100", "org0__repo4@baa9000", "org2__repo10@5445100"],
  "0:5": ["org3__repo3@cbb7000", "org2__repo10@5445100", "org2__repo18@dbb4200", "org1__repo17@ecc2200", "org1__repo5@a99b000"],
};

/** `convert_file(v2, out, limit=20, seed=42)` on the real v2 dataset. */
const v2Seed42Limit20 = ["valkey-io__valkey@36f37c0", "keycloak__keycloak@79dbba9", "ClickHouse__ClickHouse@36ea28a", "elastic__elasticsearch@dc8943f", "valkey-io__valkey@8b2137d", "cline__cline@d0a8db8", "gofr-dev__gofr@49ab394", "opencv__opencv@e3e45c8", "elastic__elasticsearch@902352a", "ClickHouse__ClickHouse@3143520", "facebook__react@be58f26", "filamentphp__filament@871ec75", "FreeCAD__FreeCAD@a050e42", "linera-io__linera-protocol@3535ddb", "elastic__elasticsearch@761281a", "cline__cline@cb4d5c9", "nodejs__node@e8b6c18", "elastic__elasticsearch@e38d20c", "ppy__osu@748ab3d", "filamentphp__filament@d47632c"];

describe("sampleAacrInstances", () => {
  for (const [key, ids] of Object.entries(expected)) {
    it(`picks what the official converter picks (seed:limit ${key})`, () => {
      const [seed, limit] = key.split(":");
      const got = sampleAacrInstances(syntheticRecords(), {
        seed: Number(seed),
        limit: limit === "all" ? undefined : Number(limit),
      });
      expect(got.map((i) => i.id)).toEqual(ids);
    });
  }

  it("matches the converter on the real v2 dataset when it is cached", async () => {
    const cache = join(process.env.XDG_CACHE_HOME || join(process.env.HOME ?? "", ".cache"), "komodo", "aacr", "datasets");
    const file = join(cache, `v2-${AACR_DATASETS.v2.sha256.slice(0, 12)}.json`);
    if (!existsSync(file)) return; // no network in tests; the synthetic cases above always run
    const records = JSON.parse(readFileSync(file, "utf8")) as AacrRecord[];
    expect(sampleAacrInstances(records, { seed: 42, limit: 20 }).map((i) => i.id)).toEqual(v2Seed42Limit20);
  });

  it("stratifies by language round-robin after the same shuffle", () => {
    const plain = sampleAacrInstances(syntheticRecords(), { seed: 7 });
    const strat = sampleAacrInstances(syntheticRecords(), { seed: 7, stratify: "language", limit: 8 });
    const languages = [...new Set(plain.map((i) => i.language))];
    expect(strat.slice(0, languages.length).map((i) => i.language)).toEqual(languages);
    // Within each language, the shuffled order is kept.
    for (const language of languages) {
      const order = plain.filter((i) => i.language === language).map((i) => i.id);
      const picked = strat.filter((i) => i.language === language).map((i) => i.id);
      expect(order.slice(0, picked.length)).toEqual(picked);
    }
    expect(strat).toHaveLength(8);
  });
});

describe("convertAacrRecord", () => {
  it("maps source_commit to base and target_commit to head, as the converter does", () => {
    const i = convertAacrRecord({
      githubPrUrl: "https://github.com/FreeCAD/FreeCAD/pull/19411",
      source_commit: " 0c65673a6fd2421be8fbe613116077120adea068 ",
      target_commit: "a050e422e23ce3eaee960b75ceff236b34f369b9",
      project_main_language: "C++",
      change_line_count: 862,
      comments: [
        { path: " src/x.cpp ", note: "  real note  ", from_line: 9, to_line: 3, side: " right ", category: "Bug", context: "Line Level" },
        { path: "src/y.cpp", note: "   " },
        { path: "", note: "no path" },
        { path: "src/z.cpp", note: "one end", to_line: 4 },
      ],
    })!;
    expect(i.id).toBe("FreeCAD__FreeCAD@a050e42");
    expect(i.repo).toBe("FreeCAD/FreeCAD");
    expect(i.baseCommit).toBe("0c65673a6fd2421be8fbe613116077120adea068");
    expect(i.headCommit).toBe("a050e422e23ce3eaee960b75ceff236b34f369b9");
    expect(i.references).toEqual([
      { path: "src/x.cpp", fromLine: 3, toLine: 9, side: "right", note: "real note", category: "Bug", context: "Line Level" },
      { path: "src/z.cpp", fromLine: 4, toLine: 4, note: "one end", category: "", context: "" },
    ]);
  });

  it("drops a record without a parseable PR URL or commits", () => {
    expect(convertAacrRecord({ githubPrUrl: "https://gitlab.com/a/b/-/merge_requests/1", source_commit: "a", target_commit: "b" })).toBeNull();
    expect(convertAacrRecord({ githubPrUrl: "https://github.com/a/b/pull/1", target_commit: "b" })).toBeNull();
  });

  it("reads owner/name out of a PR URL case-insensitively", () => {
    expect(repoFromPrUrl("HTTPS://GITHUB.COM/a/b/PULL/3")).toBe("a/b");
    expect(repoFromPrUrl(42)).toBeNull();
  });

  it("normalizes a line range like _normalize_line_range", () => {
    expect(normalizeLineRange(undefined, undefined)).toEqual({});
    expect(normalizeLineRange(5, undefined)).toEqual({ fromLine: 5, toLine: 5 });
    expect(normalizeLineRange(9, 2)).toEqual({ fromLine: 2, toLine: 9 });
  });
});

describe("ensureAacrDataset", () => {
  const body = Buffer.from("[]");
  const fakeFetch = (data: Buffer, status = 200) =>
    (async () => new Response(new Uint8Array(data), { status })) as unknown as typeof fetch;

  it("refuses a download whose sha256 does not match the pinned one, and writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-aacr-ds-"));
    dirs.push(dir);
    await expect(ensureAacrDataset("v2", dir, fakeFetch(body))).rejects.toThrow(/checksum/);
    expect(existsSync(join(dir, "datasets", `v2-${AACR_DATASETS.v2.sha256.slice(0, 12)}.json`))).toBe(false);
  });

  it("reuses a cached file that verifies, without fetching", async () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-aacr-ds-"));
    dirs.push(dir);
    // Point the cache at a file whose bytes hash to the pinned digest by
    // swapping the digest for this test's content.
    const pinned = AACR_DATASETS.v1 as { sha256: string };
    const original = pinned.sha256;
    try {
      (pinned as { sha256: string }).sha256 = sha256(body);
      const path = await ensureAacrDataset("v1", dir, fakeFetch(body));
      expect(readFileSync(path, "utf8")).toBe("[]");
      const again = await ensureAacrDataset("v1", dir, (async () => {
        throw new Error("should not fetch");
      }) as unknown as typeof fetch);
      expect(again).toBe(path);
    } finally {
      (pinned as { sha256: string }).sha256 = original;
    }
  });

  it("reports an HTTP failure with the URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "komodo-aacr-ds-"));
    dirs.push(dir);
    await expect(ensureAacrDataset("v2", dir, fakeFetch(body, 404))).rejects.toThrow(/HTTP 404 from https:\/\/raw\.githubusercontent\.com\/alibaba\/aacr-bench\/c99d126/);
  });
});
