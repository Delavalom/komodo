import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KomodoConfigSchema, type ContextSource } from "../src/config.js";
import {
  expandHome,
  parseFrontmatter,
  resolveContextSources,
  selectSharedContext,
} from "../src/context-sources.js";

const dirs: string[] = [];
const tree = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "komodo-context-"));
  dirs.push(dir);
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const source = (overrides: Partial<ContextSource> = {}): ContextSource => ({
  type: "path",
  path: ".",
  ignore: [],
  repos: [],
  clusters: [],
  ...overrides,
});

describe("expandHome", () => {
  it("expands a bare tilde and a tilde-prefixed path", () => {
    expect(expandHome("~")).not.toBe("~");
    expect(expandHome("~/x")).not.toContain("~");
  });

  it("leaves other paths untouched", () => {
    expect(expandHome("../x")).toBe("../x");
    expect(expandHome("/abs/x")).toBe("/abs/x");
  });
});

describe("parseFrontmatter", () => {
  it("parses a valid frontmatter block", () => {
    const { data, body } = parseFrontmatter(
      "---\ndescription: hi\nrepos: [acme/api]\n---\nBody text.",
    );
    expect(data).toMatchObject({ description: "hi", repos: ["acme/api"] });
    expect(body.trim()).toBe("Body text.");
  });

  it("returns the whole file untouched when there is no frontmatter", () => {
    const { data, body, error } = parseFrontmatter("Just a body.");
    expect(data).toBeNull();
    expect(body).toBe("Just a body.");
    expect(error).toBeUndefined();
  });

  it("treats an unclosed leading --- as a horizontal rule, not frontmatter", () => {
    const raw = "---\nThis is body text that never closes the fence.";
    const { data, body, error } = parseFrontmatter(raw);
    expect(data).toBeNull();
    expect(body).toBe(raw);
    expect(error).toBeUndefined();
  });

  it("warns and keeps the whole file when the frontmatter is not a mapping", () => {
    const { data, body, error } = parseFrontmatter("---\n- a\n- b\n---\nBody.");
    expect(data).toBeNull();
    expect(body).toContain("---\n- a\n- b\n---\nBody.");
    expect(error).toBeTruthy();
  });

  it("warns and keeps the whole file on invalid yaml", () => {
    const { data, error } = parseFrontmatter("---\n[unclosed\n---\nBody.");
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

describe("resolveContextSources", () => {
  it("walks nested markdown, skipping dotdirs and node_modules", () => {
    const dir = tree({
      "a.md": "A",
      "nested/b.md": "B",
      ".hidden/c.md": "hidden",
      "node_modules/d.md": "vendored",
      "e.txt": "not markdown",
    });
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: dir })] } });
    const [resolved] = resolveContextSources(config, "/");
    expect(resolved.ok).toBe(true);
    expect(resolved.files.map((f) => f.path).sort()).toEqual(["a.md", "nested/b.md"]);
  });

  it("respects the depth cap", () => {
    const deep = "a/b/c/d/e/deep.md";
    const dir = tree({ [deep]: "too deep" });
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: dir })] } });
    const [resolved] = resolveContextSources(config, "/");
    expect(resolved.files.map((f) => f.path)).not.toContain(deep);
  });

  it("resolves a relative path against configDir, not cwd", () => {
    const parent = mkdtempSync(join(tmpdir(), "komodo-context-parent-"));
    dirs.push(parent);
    mkdirSync(join(parent, "rules"));
    writeFileSync(join(parent, "rules", "a.md"), "A");
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: "rules" })] } });
    const [resolved] = resolveContextSources(config, parent);
    expect(resolved.ok).toBe(true);
    expect(resolved.files).toHaveLength(1);
  });

  it("reports a missing directory as ok: false rather than throwing", () => {
    const config = KomodoConfigSchema.parse({
      context: { sources: [source({ path: "/does/not/exist/anywhere" })] },
    });
    expect(() => resolveContextSources(config, "/")).not.toThrow();
    const [resolved] = resolveContextSources(config, "/");
    expect(resolved.ok).toBe(false);
    expect(resolved.error).toBeTruthy();
    expect(resolved.files).toEqual([]);
  });

  it("reads frontmatter scope and description off each file", () => {
    const dir = tree({
      "scoped.md": "---\ndescription: Workflows\nrepos: [acme/api]\nglobs: [\"app/**\"]\n---\nBody.",
    });
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: dir })] } });
    const [resolved] = resolveContextSources(config, "/");
    const [file] = resolved.files;
    expect(file.description).toBe("Workflows");
    expect(file.scope.repos).toEqual(["acme/api"]);
    expect(file.scope.globs).toEqual(["app/**"]);
    expect(file.text).toBe("Body.");
  });

  it("keeps the whole file and sets a warning when frontmatter is malformed", () => {
    const dir = tree({ "bad.md": "---\n[nope\n---\nBody." });
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: dir })] } });
    const [resolved] = resolveContextSources(config, "/");
    const [file] = resolved.files;
    expect(file.warning).toBeTruthy();
    expect(file.text).toContain("Body.");
  });

  it("truncates a very large file", () => {
    const dir = tree({ "big.md": "x".repeat(20_000) });
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: dir })] } });
    const [resolved] = resolveContextSources(config, "/");
    const [file] = resolved.files;
    expect(file.truncated).toBe(true);
    expect(file.text.length).toBeLessThan(9_000);
    expect(file.text).toContain("truncated");
  });

  it("applies source-level ignore globs", () => {
    const dir = tree({ "keep.md": "keep", "drafts/skip.md": "skip" });
    const config = KomodoConfigSchema.parse({
      context: { sources: [source({ path: dir, ignore: ["drafts/**"] })] },
    });
    const [resolved] = resolveContextSources(config, "/");
    expect(resolved.files.map((f) => f.path)).toEqual(["keep.md"]);
  });

  it("labels a file with the source name", () => {
    const dir = tree({ "a.md": "A" });
    const config = KomodoConfigSchema.parse({
      context: { sources: [source({ path: dir, name: "Company rules" })] },
    });
    const [resolved] = resolveContextSources(config, "/");
    expect(resolved.files[0].label).toBe("Company rules/a.md");
  });

  it("does not follow a symlinked file that escapes the source root", () => {
    const outside = tree({ "secret.md": "outside the tree" });
    const dir = tree({});
    symlinkSync(join(outside, "secret.md"), join(dir, "escape.md"));
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: dir })] } });
    const [resolved] = resolveContextSources(config, "/");
    expect(resolved.files).toHaveLength(0);
  });

  it("does not follow a symlinked directory", () => {
    const outside = tree({ "inner.md": "outside the tree" });
    const dir = tree({});
    symlinkSync(outside, join(dir, "linked"), "dir");
    const config = KomodoConfigSchema.parse({ context: { sources: [source({ path: dir })] } });
    const [resolved] = resolveContextSources(config, "/");
    expect(resolved.files).toHaveLength(0);
  });
});

describe("selectSharedContext", () => {
  type ContextFile = import("../src/context-sources.js").ContextFile;
  const doc = (
    over: Partial<Omit<ContextFile, "scope">> & { scope?: Partial<ContextFile["scope"]> } = {},
  ) => ({
    path: over.path ?? "a.md",
    label: over.label ?? "Rules/a.md",
    description: over.description,
    scope: { repos: [], clusters: [], globs: [], ...over.scope },
    text: over.text ?? "body",
    chars: (over.text ?? "body").length,
    truncated: false,
    warning: undefined,
  });
  const resolved = (files: ReturnType<typeof doc>[], over: Partial<ContextSource> = {}) => [
    { source: source(over), name: "Rules", root: "/rules", ok: true, files },
  ];

  it("applies an unscoped document everywhere", () => {
    const sel = selectSharedContext(resolved([doc()]), { changedPaths: [] });
    expect(sel.docs).toHaveLength(1);
  });

  it("matches repos by picomatch pattern", () => {
    const files = [doc({ scope: { repos: ["acme/*"] } })];
    expect(selectSharedContext(resolved(files), { repoId: "acme/api", changedPaths: [] }).docs).toHaveLength(1);
    expect(selectSharedContext(resolved(files), { repoId: "other/api", changedPaths: [] }).docs).toHaveLength(0);
  });

  it("excludes a repo-scoped document when repoId is unknown", () => {
    const files = [doc({ scope: { repos: ["acme/api"] } })];
    expect(selectSharedContext(resolved(files), { changedPaths: [] }).docs).toHaveLength(0);
  });

  it("matches clusters by case-insensitive name", () => {
    const files = [doc({ scope: { clusters: ["Integrations"] } })];
    const sel = selectSharedContext(resolved(files), { clusterNames: ["integrations"], changedPaths: [] });
    expect(sel.docs).toHaveLength(1);
  });

  it("reports a cluster-scoped document as needing clusters when the caller cannot resolve them", () => {
    const files = [doc({ scope: { clusters: ["integrations"] } })];
    const sel = selectSharedContext(resolved(files), { changedPaths: [] });
    expect(sel.docs).toHaveLength(0);
    expect(sel.needsClusters).toHaveLength(1);
  });

  it("matches globs against changed paths", () => {
    const files = [doc({ scope: { globs: ["app/**"] } })];
    expect(
      selectSharedContext(resolved(files), { changedPaths: ["app/x.ts"] }).docs,
    ).toHaveLength(1);
    expect(
      selectSharedContext(resolved(files), { changedPaths: ["other/x.ts"] }).docs,
    ).toHaveLength(0);
  });

  it("ANDs source-level scope with file-level scope", () => {
    const files = [doc({ scope: { repos: ["acme/api"] } })];
    const sel = selectSharedContext(resolved(files, { repos: ["other/*"] }), {
      repoId: "acme/api",
      changedPaths: [],
    });
    expect(sel.docs).toHaveLength(0);
  });

  it("skips a source that failed to resolve", () => {
    const bad = [{ source: source(), name: "Rules", root: "/rules", ok: false, error: "nope", files: [doc()] }];
    expect(selectSharedContext(bad, { changedPaths: [] }).docs).toHaveLength(0);
  });

  it("caps total characters and reports overflow in order", () => {
    const files = [doc({ path: "a.md", text: "x".repeat(10) }), doc({ path: "b.md", text: "y".repeat(10) })];
    const sel = selectSharedContext(resolved(files), { changedPaths: [], maxTotalChars: 15 });
    expect(sel.docs).toHaveLength(1);
    expect(sel.overflow).toHaveLength(1);
    expect(sel.overflow[0].path).toBe("b.md");
  });
});

describe("KomodoConfigSchema context block", () => {
  it("parses a path source with defaults", () => {
    const config = KomodoConfigSchema.parse({ context: { sources: [{ type: "path", path: "../rules" }] } });
    expect(config.context.sources[0]).toMatchObject({ type: "path", path: "../rules", repos: [], clusters: [] });
    expect(config.context.max_total_chars).toBe(32_000);
  });

  it("rejects an unknown source type", () => {
    expect(() =>
      KomodoConfigSchema.parse({ context: { sources: [{ type: "github", repo: "acme/rules" }] } }),
    ).toThrow();
  });

  it("defaults to no sources", () => {
    const config = KomodoConfigSchema.parse({});
    expect(config.context.sources).toEqual([]);
  });
});
