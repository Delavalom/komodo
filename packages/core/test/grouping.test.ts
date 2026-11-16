import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  bundleFiles,
  DEFAULT_BUNDLE_OPTIONS,
  isReviewable,
  relationKey,
  type BundleFile,
  type BundleOptions,
} from "../src/grouping.js";

const file = (path: string, over: Partial<BundleFile> = {}): BundleFile => ({
  path,
  additions: 10,
  deletions: 2,
  patch: `@@ -1 +1 @@\n+${path}`,
  ...over,
});

const paths = (bundles: { files: BundleFile[] }[]) => bundles.map((b) => b.files.map((f) => f.path));

describe("relationKey", () => {
  it("ties locale variants together, in names and in directories", () => {
    expect(relationKey("i18n/message_en.properties")).toBe(relationKey("i18n/message_zh.properties"));
    expect(relationKey("i18n/message_en.properties")).toBe(relationKey("i18n/message_zh_CN.properties"));
    expect(relationKey("locales/en/common.json")).toBe(relationKey("locales/fr/common.json"));
    expect(relationKey("strings.pt-br.json")).toBe(relationKey("strings.de.json"));
  });

  it("ties a source file to its test, whatever the convention", () => {
    const src = relationKey("packages/core/src/merge.ts");
    expect(relationKey("packages/core/test/merge.test.ts")).toBe(src);
    expect(relationKey("packages/core/src/merge.spec.tsx")).toBe(src);
    expect(relationKey("pkg/foo_test.go")).toBe(relationKey("pkg/foo.go"));
    expect(relationKey("tests/test_foo.py")).toBe(relationKey("foo.py"));
    expect(relationKey("src/main/java/com/x/Foo.java")).toBe(relationKey("src/test/java/com/x/FooTest.java"));
    expect(relationKey("src/test/java/com/x/FooTests.java")).toBe(relationKey("src/main/java/com/x/Foo.java"));
  });

  it("ties an interface to its implementation", () => {
    const iface = relationKey("com/x/IUserService.java");
    expect(relationKey("com/x/UserServiceImpl.java")).toBe(iface);
    expect(relationKey("com/x/impl/UserServiceImpl.java")).toBe(iface);
    expect(relationKey("com/x/UserService.java")).toBe(iface);
    expect(relationKey("com/x/AbstractUserService.java")).toBe(iface);
  });

  it("ties the files of one unit", () => {
    expect(relationKey("ui/Button.tsx")).toBe(relationKey("ui/Button.module.css"));
    expect(relationKey("types/foo.d.ts")).toBe(relationKey("types/foo.js"));
  });

  it("does not tie names that only look alike", () => {
    expect(relationKey("src/Latest.ts")).not.toBe(relationKey("src/La.ts"));
    expect(relationKey("src/Item.ts")).not.toBe(relationKey("src/tem.ts"));
    expect(relationKey("src/user_id.ts")).not.toBe(relationKey("src/user.ts"));
    expect(relationKey("a/index.ts")).not.toBe(relationKey("b/index.ts"));
  });

  it("keeps a dotfile's own name, and a name that is only a marker", () => {
    expect(relationKey(".eslintrc.json")).toBe(".eslintrc");
    expect(relationKey("src/test.ts")).toBe("test");
  });
});

describe("bundleFiles", () => {
  it("returns nothing for nothing, and ignores files with no textual diff", () => {
    expect(bundleFiles([])).toEqual([]);
    const binary = file("logo.png", { patch: undefined });
    expect(isReviewable(binary)).toBe(false);
    expect(bundleFiles([binary])).toEqual([]);
    expect(paths(bundleFiles([binary, file("a.ts")]))).toEqual([["a.ts"]]);
  });

  it("keeps a small change set in one unit (OCR: fewer than 4 files, under 200 lines)", () => {
    const bundles = bundleFiles([file("b.ts"), file("a.ts"), file("c.ts")]);
    expect(paths(bundles)).toEqual([["a.ts", "b.ts", "c.ts"]]);
  });

  it("gives each file its own unit when a few files carry a lot of change", () => {
    const big = (p: string) => file(p, { additions: 150, deletions: 0 });
    expect(paths(bundleFiles([big("b.ts"), big("a.ts")]))).toEqual([["a.ts"], ["b.ts"]]);
  });

  it("holds a large change at the 4-file threshold to relation grouping, not one unit", () => {
    const four = ["a/x.ts", "b/y.ts", "c/z.ts", "d/w.ts"].map((p) => file(p));
    // Four unrelated files all fit one bundle, packed in path order.
    expect(paths(bundleFiles(four))).toEqual([["a/x.ts", "b/y.ts", "c/z.ts", "d/w.ts"]]);
  });

  it("keeps related files in the same bundle even across a size boundary", () => {
    const files = [
      ...Array.from({ length: 8 }, (_, i) => file(`lib/mod${i}.ts`)),
      file("i18n/message_en.properties"),
      file("i18n/message_zh.properties"),
      file("src/merge.ts"),
      file("test/merge.test.ts"),
    ];
    const bundles = bundleFiles(files, { maxFilesPerBundle: 3 });
    const of = (p: string) => bundles.findIndex((b) => b.files.some((f) => f.path === p));
    expect(of("i18n/message_en.properties")).toBe(of("i18n/message_zh.properties"));
    expect(of("src/merge.ts")).toBe(of("test/merge.test.ts"));
    expect(bundles.every((b) => b.files.length <= 3)).toBe(true);
  });

  it("splits an over-large relation cluster instead of exceeding the file cap", () => {
    const locales = ["en", "zh", "fr", "de", "es", "pt", "ja", "ko", "ru", "nl", "pl", "tr"].map((l) =>
      file(`i18n/message_${l}.properties`),
    );
    const bundles = bundleFiles(locales);
    expect(bundles.map((b) => b.files.length)).toEqual([10, 2]);
  });

  it("respects the patch-size cap, leaving a single oversized file alone", () => {
    const sized = (p: string, n: number) => file(p, { patch: "x".repeat(n) });
    const bundles = bundleFiles(
      [sized("a.ts", 60), sized("b.ts", 60), sized("c.ts", 500), sized("d.ts", 30), sized("e.ts", 30)],
      { maxBundleChars: 100 },
    );
    for (const b of bundles) {
      const total = b.files.reduce((s, f) => s + (f.patch?.length ?? 0), 0);
      if (b.files.length > 1) expect(total).toBeLessThanOrEqual(100);
    }
    expect(bundles.find((b) => b.files.some((f) => f.path === "c.ts"))!.files).toHaveLength(1);
  });

  it("labels a bundle by its file or its shared directory", () => {
    const bundles = bundleFiles([file("a/b/x.ts"), file("a/b/y.ts")]);
    expect(bundles[0].label).toBe("a/b (2 files)");
    expect(bundleFiles([file("only.ts")])[0].label).toBe("only.ts");
    expect(bundleFiles([file("a/x.ts"), file("b/y.ts")])[0].label).toBe(". (2 files)");
  });

  it("does not depend on input order", () => {
    const files = ["z/a.ts", "a/b.ts", "m/c.ts", "a/b.test.ts", "m/d.ts", "q/e.ts"].map((p) => file(p));
    const forward = paths(bundleFiles(files, { maxFilesPerBundle: 3 }));
    expect(paths(bundleFiles([...files].reverse(), { maxFilesPerBundle: 3 }))).toEqual(forward);
  });
});

describe("bundleFiles — properties", () => {
  const RUNS = { seed: 20261116, numRuns: 400 };

  const segment = fc.constantFrom("src", "test", "lib", "i18n", "ui", "a", "b", "core");
  const stem = fc.constantFrom(
    "merge", "Merge", "IMerge", "MergeImpl", "MergeTest", "message_en", "message_zh", "message_fr",
    "index", "user_id", "user", "Button", "util", "test_util",
  );
  const ext = fc.constantFrom(".ts", ".test.ts", ".spec.ts", ".java", ".properties", ".module.css", ".go");
  const path = fc
    .tuple(fc.array(segment, { maxLength: 3 }), stem, ext)
    .map(([dirs, s, e]) => [...dirs, `${s}${e}`].join("/"));

  const fileArb = fc
    .tuple(path, fc.nat({ max: 120 }), fc.nat({ max: 120 }), fc.option(fc.nat({ max: 3000 }), { nil: undefined }))
    .map(([p, additions, deletions, size]) =>
      file(p, { additions, deletions, patch: size === undefined ? undefined : "x".repeat(size + 1) }),
    );
  const filesArb = fc
    .array(fileArb, { maxLength: 40 })
    // Paths are unique per pull request.
    .map((fs) => [...new Map(fs.map((f) => [f.path, f])).values()]);

  const optionsArb: fc.Arbitrary<Partial<BundleOptions>> = fc.record({
    minFiles: fc.integer({ min: 0, max: 8 }),
    smallChangeLines: fc.integer({ min: 0, max: 400 }),
    maxFilesPerBundle: fc.integer({ min: 1, max: 12 }),
    maxBundleChars: fc.integer({ min: 1, max: 6000 }),
  });

  it("puts every reviewable file in exactly one bundle, and nothing else in any", () => {
    fc.assert(
      fc.property(filesArb, optionsArb, (files, options) => {
        const bundled = bundleFiles(files, options).flatMap((b) => b.files.map((f) => f.path));
        const want = files.filter(isReviewable).map((f) => f.path);
        expect([...bundled].sort()).toEqual([...want].sort());
        expect(new Set(bundled).size).toBe(bundled.length);
      }),
      RUNS,
    );
  });

  it("never exceeds the file or size cap in a multi-file bundle, and never emits an empty one", () => {
    fc.assert(
      fc.property(filesArb, optionsArb, (files, options) => {
        const opts = { ...DEFAULT_BUNDLE_OPTIONS, ...options };
        for (const b of bundleFiles(files, options)) {
          expect(b.files.length).toBeGreaterThan(0);
          if (b.files.length > 1) {
            expect(b.files.length).toBeLessThanOrEqual(opts.maxFilesPerBundle);
            const total = b.files.reduce((s, f) => s + (f.patch?.length ?? 0), 0);
            expect(total).toBeLessThanOrEqual(opts.maxBundleChars);
          }
        }
      }),
      RUNS,
    );
  });

  it("is deterministic, whatever order the files arrive in", () => {
    fc.assert(
      fc.property(filesArb, optionsArb, fc.nat(), (files, options, turn) => {
        const baseline = paths(bundleFiles(files, options));
        const k = files.length ? turn % files.length : 0;
        const rotated = [...files.slice(k), ...files.slice(0, k)];
        expect(paths(bundleFiles(rotated, options))).toEqual(baseline);
        expect(paths(bundleFiles([...files].reverse(), options))).toEqual(baseline);
        expect(paths(bundleFiles(files, options))).toEqual(baseline);
      }),
      RUNS,
    );
  });

  it("sorts the files inside each bundle by path", () => {
    fc.assert(
      fc.property(filesArb, optionsArb, (files, options) => {
        for (const b of bundleFiles(files, options)) {
          const ps = b.files.map((f) => f.path);
          expect(ps).toEqual([...ps].sort());
        }
      }),
      RUNS,
    );
  });

  it("keeps files that share a relation key together when the caps allow", () => {
    fc.assert(
      fc.property(filesArb, (files) => {
        // Caps wide enough that no cluster is ever split.
        const options = { minFiles: 1, maxFilesPerBundle: 100, maxBundleChars: Number.MAX_SAFE_INTEGER };
        const bundles = bundleFiles(files, options);
        const home = new Map<string, number>();
        bundles.forEach((b, i) => b.files.forEach((f) => home.set(f.path, i)));
        const byKey = new Map<string, number>();
        for (const f of files.filter(isReviewable)) {
          const key = relationKey(f.path);
          const seen = byKey.get(key);
          if (seen === undefined) byKey.set(key, home.get(f.path)!);
          else expect(home.get(f.path)).toBe(seen);
        }
      }),
      RUNS,
    );
  });
});
