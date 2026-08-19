import type { Metadata } from "next";

import {
  ComparisonPage,
  type ComparisonRow,
} from "@/components/marketing/comparison-page";

export const metadata: Metadata = {
  title: "Greptile vs Bugbot — AI code review tools compared",
  description:
    "Why an independent validation layer beats a reviewer bundled with the tool that wrote the code.",
};

const ROWS: ComparisonRow[] = [
  {
    capability: "Independent of the author",
    detail:
      "The reviewer is not the same system that generated the change, which is the whole basis for trusting the verdict.",
    ours: true,
    theirs: false,
  },
  {
    capability: "Works with every agent",
    detail:
      "Findings hand off into whichever coding agent your team already uses, rather than one vendor's.",
    ours: true,
    theirs: "partial",
  },
  {
    capability: "Whole-repository context",
    detail:
      "Reviews are written against a graph of the codebase and its neighbours, not the diff alone.",
    ours: true,
    theirs: "partial",
  },
  {
    capability: "Runtime validation",
    detail:
      "The branch is executed in a sandbox and probed at its edges, not only read.",
    ours: true,
    theirs: false,
  },
  {
    capability: "Dedicated security pass",
    detail:
      "A separate reachability-first pass, so reported issues come with a path from an entry point.",
    ours: true,
    theirs: "partial",
  },
  {
    capability: "Configured in the repo",
    detail:
      "A .greptile/ directory reviewed like any other code, scoped per directory and owned per team.",
    ours: true,
    theirs: false,
  },
  {
    capability: "Self-hosted option",
    detail:
      "Runs inside your own environment when code cannot leave it.",
    ours: true,
    theirs: false,
  },
];

const SECTIONS = [
  {
    eyebrow: "Independence",
    heading: "Why the reviewer should not be the author",
    body: "A model grades its own output generously — it makes the same assumptions twice, so the mistakes it made writing the code are invisible to it reading the code. Keeping generation and validation in separate systems is not a philosophical position; it is the only arrangement in which a passing review carries information.",
  },
  {
    eyebrow: "Lock-in",
    heading: "The validation layer should outlive your tool choices",
    body: "Teams change editors and agents constantly, and will change them again. A reviewer bundled into one of those tools has to be re-adopted every time, and takes its accumulated knowledge of your standards with it when it goes. An independent layer keeps that knowledge where it belongs — next to the repository.",
  },
  {
    eyebrow: "Depth",
    heading: "Reading is half of validation",
    body: "Static review finds the defects that are visible in the text. Whole categories — ordering, concurrency, resource lifetimes, the edge cases nobody wrote a test for — only appear when the code runs. Doing both is more expensive and it is the reason the catch rate is where it is.",
  },
];

/** docs/SPEC-MARKETING.md §M10.5. */
export default function GreptileVsBugbotPage() {
  return (
    <ComparisonPage
      competitor="Bugbot"
      dek="One is a reviewer bundled with a coding tool. The other is a validation layer that stays independent of whatever wrote the code."
      rows={ROWS}
      sections={SECTIONS}
    />
  );
}
