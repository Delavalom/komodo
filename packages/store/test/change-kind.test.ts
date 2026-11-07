/**
 * What may sink to the bottom of the queue, and — the part that matters —
 * what must not. Every "null" case below is a real change that a looser rule
 * would have filed as a typo fix.
 */
import { describe, expect, it } from "vitest";

import { changeKind } from "../src/change-kind.js";

const kind = (files: { path: string; patch: string | null }[], changedFiles = files.length) =>
  changeKind({ files, changedFiles });

const patch = (...lines: string[]) => ["@@ -1,4 +1,4 @@", ...lines].join("\n");

describe("changeKind", () => {
  it("calls documentation documentation, whatever the patch says", () => {
    expect(kind([{ path: "docs/setup.md", patch: patch("-old", "+new") }])).toEqual(["docs"]);
    expect(kind([{ path: "README.MDX", patch: null }])).toEqual(["docs"]);
  });

  it("reads a change to comments alone as comments", () => {
    expect(
      kind([
        {
          path: "src/a.ts",
          patch: patch(" const a = 1;", "-// old note", "+// new note", "+/**", "+ * More.", "+ */", " run(a);"),
        },
        { path: "scripts/b.py", patch: patch(" x = 1", "+# why x is one", "") },
      ]),
    ).toEqual(["comments"]);
  });

  it("reads a reflow of the same code as whitespace", () => {
    expect(
      kind([
        {
          path: "src/a.ts",
          patch: patch("-call(a,b, c)", "+call(", "+  a,", "+  b,", "+  c,", "+)"),
        },
      ]),
    ).toBeNull(); // the trailing comma is a real token, so this is not a reflow
    expect(
      kind([{ path: "src/a.ts", patch: patch("-call(a,b,  c)", "+call(", "+  a, b, c", "+)") }]),
    ).toEqual(["whitespace"]);
  });

  it("names every reason a mixed mechanical change has", () => {
    expect(
      kind([
        { path: "CHANGELOG.md", patch: patch("+- note") },
        { path: "src/a.go", patch: patch("+// note") },
      ]),
    ).toEqual(["docs", "comments"]);
  });

  it("refuses one changed line of code", () => {
    expect(
      kind([
        { path: "docs/a.md", patch: patch("+x") },
        { path: "src/a.ts", patch: patch("+// note", "+run();") },
      ]),
    ).toBeNull();
  });

  it("refuses a block comment wrapped around unchanged code", () => {
    expect(
      kind([{ path: "src/a.ts", patch: patch("+/*", " run();", "+*/") }]),
    ).toBeNull();
    // and the reverse: removing the markers brings code back to life
    expect(
      kind([{ path: "src/a.ts", patch: patch("-/*", " run();", "-*/") }]),
    ).toBeNull();
  });

  it("refuses code hiding behind a comment marker on the same line", () => {
    expect(kind([{ path: "src/a.ts", patch: patch("+/* note */ run();") }])).toBeNull();
    expect(kind([{ path: "src/a.ts", patch: patch("+/*", "+ note", "+*/ run();") }])).toBeNull();
  });

  it("refuses commenting code out", () => {
    expect(kind([{ path: "src/a.py", patch: patch("-run()", "+# run()") }])).toBeNull();
  });

  it("refuses comments that steer a tool", () => {
    expect(kind([{ path: "src/a.ts", patch: patch("+// @ts-expect-error") }])).toBeNull();
    expect(kind([{ path: "src/a.ts", patch: patch("+// eslint-disable-next-line") }])).toBeNull();
    expect(kind([{ path: "main.go", patch: patch("+//go:build linux") }])).toBeNull();
    expect(kind([{ path: "run.sh", patch: patch("-#!/bin/sh", "+#!/bin/bash") }])).toBeNull();
    expect(kind([{ path: "a.rb", patch: patch("+# frozen_string_literal: true") }])).toBeNull();
  });

  it("refuses a reindent where indentation is syntax", () => {
    expect(kind([{ path: "a.py", patch: patch("-    run()", "+run()") }])).toBeNull();
    expect(kind([{ path: "ci.yml", patch: patch("-  key: 1", "+    key: 1") }])).toBeNull();
  });

  it("keeps spacing inside a string as a change", () => {
    expect(kind([{ path: "a.ts", patch: patch('-say("a b")', '+say("ab")') }])).toBeNull();
  });

  it("refuses what it cannot read", () => {
    // GitHub omits the patch for a binary or oversized file
    expect(kind([{ path: "src/a.ts", patch: null }])).toBeNull();
    // a rename with no content change still breaks its importers
    expect(kind([{ path: "src/b.ts", patch: "" }])).toBeNull();
    // no comment syntax known for CSS, where `*` is a selector
    expect(kind([{ path: "a.css", patch: patch("+* { margin: 0 }") }])).toBeNull();
    // requirements.txt is not documentation
    expect(kind([{ path: "requirements.txt", patch: patch("+requests==2.0") }])).toBeNull();
    expect(kind([])).toBeNull();
  });

  it("refuses when a path filter dropped a file it never saw", () => {
    // README read, but the lockfile bump beside it was filtered out of the run
    expect(kind([{ path: "README.md", patch: patch("+x") }], 2)).toBeNull();
  });
});
