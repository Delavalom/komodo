import { describe, expect, it } from "vitest";
import { annotatePatch, changeFingerprint, commentableLines, filterPaths } from "../src/diff.js";
import { MAX_LISTED_FILES, type PRFile } from "../src/github.js";

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

describe("changeFingerprint", () => {
  const file = (over: Partial<PRFile> = {}): PRFile => ({
    path: "src/a.ts",
    status: "modified",
    additions: 1,
    deletions: 0,
    patch: "@@ -10,3 +10,4 @@ function a() {\n ctx\n+added\n ctx",
    ...over,
  });
  const fp = (...files: PRFile[]) => changeFingerprint(files);

  it("is the same change after a rebase moved the hunk and its heading", () => {
    expect(fp(file({ patch: "@@ -90,3 +92,4 @@ class B {\n ctx\n+added\n ctx" }))).toBe(fp(file()));
  });

  it("does not care what order GitHub listed the files in", () => {
    const b = file({ path: "src/b.ts" });
    expect(fp(file(), b)).toBe(fp(b, file()));
  });

  it("ignores line endings and trailing whitespace", () => {
    expect(fp(file({ patch: "@@ -1 +1 @@\r\n ctx  \r\n+added\r\n ctx" }))).toBe(fp(file()));
  });

  it("is a different change when an added line, a context line or indentation differs", () => {
    expect(fp(file({ patch: "@@ -10,3 +10,4 @@\n ctx\n+changed\n ctx" }))).not.toBe(fp(file()));
    expect(fp(file({ patch: "@@ -10,3 +10,4 @@\n other\n+added\n ctx" }))).not.toBe(fp(file()));
    expect(fp(file({ patch: "@@ -10,3 +10,4 @@\n ctx\n+  added\n ctx" }))).not.toBe(fp(file()));
    expect(fp(file({ status: "added" }))).not.toBe(fp(file()));
  });

  it("vouches for nothing it did not see all of", () => {
    expect(fp()).toBeNull();
    expect(fp(file(), file({ path: "logo.png", patch: undefined }))).toBeNull();
    expect(
      changeFingerprint(Array.from({ length: MAX_LISTED_FILES }, (_, i) => file({ path: `f${i}` }))),
    ).toBeNull();
  });
});
