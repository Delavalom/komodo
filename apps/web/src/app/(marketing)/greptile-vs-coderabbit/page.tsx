import type { Metadata } from "next";

import {
  ComparisonPage,
  type ComparisonRow,
} from "@/components/marketing/comparison-page";

export const metadata: Metadata = {
  title: "Greptile vs CodeRabbit — AI code review tools compared",
  description:
    "How a graph-indexed reviewer differs from a diff-scoped one, and why comment volume is the number to watch.",
};

const ROWS: ComparisonRow[] = [
  {
    capability: "Reads beyond the diff",
    detail:
      "Findings are formed against a graph of the whole repository, so a change that breaks a caller three files away still gets caught.",
    ours: true,
    theirs: "partial",
  },
  {
    capability: "Tuned for silence",
    detail:
      "Precision is treated as the product. A finding that cannot be tied to a concrete failure does not get posted.",
    ours: true,
    theirs: false,
  },
  {
    capability: "Runs the code",
    detail:
      "The branch is built and exercised in a sandbox, so runtime-only defects surface during review.",
    ours: true,
    theirs: false,
  },
  {
    capability: "Learns from your reviewers",
    detail:
      "Dismissed and resolved comments feed back in, so the categories your team rejects stop being raised.",
    ours: true,
    theirs: "partial",
  },
  {
    capability: "Rules in plain English",
    detail:
      "Standards are written as prose and scoped to paths, with no plugin or DSL to maintain.",
    ours: true,
    theirs: "partial",
  },
  {
    capability: "Model agnostic",
    detail:
      "Routing picks whichever model is best for the task, and changes as the frontier does.",
    ours: true,
    theirs: "partial",
  },
  {
    capability: "Self-hosted option",
    detail:
      "The whole system can run inside your own account, including air-gapped.",
    ours: true,
    theirs: false,
  },
];

const SECTIONS = [
  {
    eyebrow: "Context",
    heading: "How Greptile understands your codebase",
    body: "Indexing produces a graph of files, symbols, call edges and ownership, and reviews walk outward from the changed lines through that graph. That is the difference between noticing a signature changed and noticing which three callers now break, and it is why cross-file defects show up at all.",
  },
  {
    eyebrow: "Volume",
    heading: "An agent of few words",
    body: "Any reviewer can raise its catch rate by commenting more. The cost lands on your team a fortnight later, when people stop reading the comments and the tool becomes noise with a subscription. We track comments per pull request as closely as catches, and we would rather miss a marginal finding than spend your attention on a wrong one.",
  },
  {
    eyebrow: "Evaluation",
    heading: "How to actually compare them",
    body: "Run both against the same busy repository for a week with default settings, then read every comment each produced. Count the ones that changed the code. That number, divided by the total, tells you more than any published benchmark — including ours.",
  },
];

/** docs/SPEC-MARKETING.md §M10.5. */
export default function GreptileVsCodeRabbitPage() {
  return (
    <ComparisonPage
      competitor="CodeRabbit"
      dek="Both review pull requests with a model. The interesting difference is how much of the repository each one reads first, and how much it decides to say."
      rows={ROWS}
      sections={SECTIONS}
    />
  );
}
