import { describe, expect, it } from "vitest";
import { annotatePatch, commentableLines, filterPaths } from "../src/diff.js";

const PATCH = [
  "@@ -1,4 +1,5 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " export { a, b };",
  "@@ -10,2 +11,3 @@",
  " function f() {",
  "+  return b + c;",
  " }",
].join("\n");

describe("commentableLines", () => {
  it("maps added and context lines to new-file numbers", () => {
    const { right, added } = commentableLines(PATCH);
    expect(added).toEqual(new Set([2, 3, 12]));
    expect(right).toEqual(new Set([1, 2, 3, 4, 11, 12, 13]));
  });

  it("does not advance on deletions", () => {
    const { right } = commentableLines("@@ -1,2 +1,1 @@\n-gone\n kept");
    expect(right).toEqual(new Set([1]));
  });
});

describe("annotatePatch", () => {
  it("prefixes new-file line numbers and blanks deletions", () => {
    const lines = annotatePatch(PATCH).split("\n");
    expect(lines[1]).toBe("    1  const a = 1;");
    expect(lines[2]).toBe("      -const b = 2;");
    expect(lines[3]).toBe("    2 +const b = 3;");
    expect(lines[7]).toBe("   11  function f() {");
  });
});

describe("filterPaths", () => {
  it("applies default-style excludes", () => {
    const kept = filterPaths(
      ["src/app.ts", "pnpm-lock.yaml", "dist/x.js", "assets/logo.svg"],
      ["!**/*.lock", "!**/pnpm-lock.yaml", "!**/dist/**", "!**/*.svg"],
    );
    expect(kept).toEqual(["src/app.ts"]);
  });

  it("positive globs restrict when present", () => {
    expect(filterPaths(["a.ts", "b.md"], ["**/*.ts"])).toEqual(["a.ts"]);
  });
});
