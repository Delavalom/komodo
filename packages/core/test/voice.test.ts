import { describe, expect, it } from "vitest";
import { VOICE_STYLE, voiceLint, voiceSection } from "../src/voice.js";

// The two worked examples inside VOICE_STYLE.md itself, extracted rather than
// retyped: if the asset changes, these tests read the new copy rather than
// silently checking a stale one.
function quotedBlock(heading: string): string[] {
  const start = VOICE_STYLE.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`VOICE_STYLE.md has no "${heading}" section`);
  const nextHeading = VOICE_STYLE.indexOf("\n## ", start + 1);
  const section = VOICE_STYLE.slice(start, nextHeading === -1 ? undefined : nextHeading);
  return section
    .split("\n\n")
    .filter((block) => block.trim().startsWith(">"))
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join(" ")
        .trim(),
    );
}

describe("VOICE_STYLE.md", () => {
  it("has both worked examples", () => {
    expect(quotedBlock("Two comments in this voice")).toHaveLength(2);
    expect(quotedBlock("The same two, the way not to write them")).toHaveLength(2);
  });
});

describe("voiceLint", () => {
  it("passes the two comments written in the house voice", () => {
    for (const comment of quotedBlock("Two comments in this voice")) {
      expect(voiceLint(comment), comment).toEqual([]);
    }
  });

  it("flags the two comments written the way not to", () => {
    for (const comment of quotedBlock("The same two, the way not to write them")) {
      expect(voiceLint(comment).length, comment).toBeGreaterThan(0);
    }
  });

  it("flags an em-dash", () => {
    expect(voiceLint("This works — but only sometimes.")).toContainEqual(
      expect.objectContaining({ rule: "no em-dash" }),
    );
  });

  it("flags bold text", () => {
    expect(voiceLint("**Risk** · this could break.")).toContainEqual(
      expect.objectContaining({ rule: "no bold" }),
    );
  });

  it("flags a banned phrase regardless of case", () => {
    expect(voiceLint("Consider Refactoring this later.")).toContainEqual(
      expect.objectContaining({ rule: 'never: "consider refactoring"' }),
    );
  });

  it("has nothing to flag in an ordinary sentence", () => {
    expect(voiceLint("This should be an activity, not inline in the workflow.")).toEqual([]);
  });
});

describe("voiceSection", () => {
  it("carries the house voice", () => {
    expect(voiceSection()).toContain("## How to write");
    expect(voiceSection()).toContain(VOICE_STYLE);
  });

  it("appends a team's own vocabulary after the house voice, never in place of it", () => {
    const section = voiceSection("We call the Temporal side \"workflows\", never \"jobs\".");
    expect(section).toContain("## How to write");
    expect(section).toContain("## This team's vocabulary");
    expect(section.indexOf("## How to write")).toBeLessThan(
      section.indexOf("## This team's vocabulary"),
    );
    expect(section).toContain('"workflows"');
  });

  it("adds no vocabulary section when there is none", () => {
    expect(voiceSection("   ")).not.toContain("This team's vocabulary");
    expect(voiceSection(undefined)).not.toContain("This team's vocabulary");
  });
});
