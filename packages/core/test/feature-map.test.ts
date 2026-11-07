import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_FEATURE_MAP_CHARS, readFeatureMap } from "../src/feature-map.js";

describe("readFeatureMap", () => {
  let dir: string;
  let outside: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "komodo-feature-map-"));
    outside = mkdtempSync(join(tmpdir(), "komodo-feature-map-outside-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const write = (path: string, text: string) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  };

  it("reads nothing from a checkout without a map", () => {
    expect(readFeatureMap(dir)).toBeNull();
  });

  it("reads nothing from a directory that does not exist", () => {
    expect(readFeatureMap(join(dir, "missing"))).toBeNull();
  });

  it("prefers docs/feature-map.md over the other places", () => {
    write("FEATURES.md", "root map");
    write("docs/feature-map.md", "docs map");
    expect(readFeatureMap(dir)).toEqual({ path: "docs/feature-map.md", text: "docs map", truncated: false });
  });

  it("falls through an empty map to the next one", () => {
    write("docs/feature-map.md", "  \n\n");
    write(".github/feature-map.md", "github map");
    expect(readFeatureMap(dir)?.path).toBe(".github/feature-map.md");
  });

  it("truncates a very large map", () => {
    write("FEATURES.md", "x".repeat(MAX_FEATURE_MAP_CHARS + 50));
    const map = readFeatureMap(dir);
    expect(map?.truncated).toBe(true);
    expect(map?.text.endsWith("…(truncated)")).toBe(true);
    expect(map?.text.length).toBeLessThan(MAX_FEATURE_MAP_CHARS + 20);
  });

  it("refuses a map that is a symlink out of the checkout", () => {
    writeFileSync(join(outside, "secret.md"), "not yours");
    symlinkSync(join(outside, "secret.md"), join(dir, "FEATURES.md"));
    expect(readFeatureMap(dir)).toBeNull();
  });

  it("refuses a docs directory that is a symlink out of the checkout", () => {
    writeFileSync(join(outside, "feature-map.md"), "not yours");
    symlinkSync(outside, join(dir, "docs"));
    expect(readFeatureMap(dir)).toBeNull();
  });

  it("follows a symlink that stays inside the checkout", () => {
    write("notes/map.md", "inside");
    symlinkSync(join(dir, "notes/map.md"), join(dir, "FEATURES.md"));
    expect(readFeatureMap(dir)?.text).toBe("inside");
  });
});
