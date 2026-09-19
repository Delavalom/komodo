import { BarChart3, FileText, Table2, Workflow } from "lucide-react";
import type { ReactNode } from "react";

import type { SummarySectionKey } from "@/lib/types";

/**
 * The blocks a posted review can carry.
 *
 * One per module in @komodo/core's renderer — no more. The org settings
 * screen used to offer an "Issue Table" and "Comments Outside Diff" that
 * nothing rendered, which made every other control here look equally
 * decorative.
 *
 * They apply to what GitHub gets in `post.mode: full`. In the default receipt
 * mode GitHub gets a link and the review itself lives in Komodo, where none
 * of this applies.
 *
 * Shared between the personal and org settings screens because it's the same
 * renderer either way; it used to be copy-pasted between them and drifted.
 */
export const SUMMARY_ROWS: {
  key: SummarySectionKey;
  title: string;
  description: string;
  icon: ReactNode;
  hint?: string;
}[] = [
  {
    key: "summary",
    title: "Summary",
    description: "What changed, in the reviewer's own words",
    icon: <FileText className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "confidence",
    title: "Review coverage",
    description: "How much context the AI brief had, never a merge recommendation",
    icon: <BarChart3 className="h-5 w-5 text-muted-foreground" />,
    hint: "How well grounded the AI review brief is, from 0 to 5.",
  },
  {
    key: "walkthrough",
    title: "Walkthrough",
    description: "Related files grouped into rows, each with a plain-language note",
    icon: <Table2 className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "diagram",
    title: "Diagram",
    description: "A sequence, flowchart, state, or ER diagram, when the change fits one of those shapes",
    icon: <Workflow className="h-5 w-5 text-muted-foreground" />,
  },
];
