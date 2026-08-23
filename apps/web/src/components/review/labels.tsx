/**
 * The words and colours the review screens share.
 *
 * Kept here rather than imported from @komodo/core: core's label maps are
 * written for GitHub markdown and carry emoji, which is the wrong register in
 * an app that owns its own type. The vocabularies are the same; the rendering
 * is not.
 */
import type { Bucket, JudgementKind, JudgementSeverity } from "@/lib/types";

export const KIND_LABEL: Record<JudgementKind, string> = {
  Choice: "A choice was made",
  Risk: "A risk was taken",
  Behaviour: "Behaviour changes",
  Domain: "Reaches outside this change",
  Unsure: "Komodo is unsure",
};

export const SEVERITY_TONE: Record<JudgementSeverity, string> = {
  critical: "text-[hsl(var(--destructive))]",
  major: "text-[hsl(var(--color-orange-400))]",
  minor: "text-muted-foreground",
  trivial: "text-muted-foreground",
};

export const BUCKET_TONE: Record<Bucket, string> = {
  Blocks: "text-[hsl(var(--destructive))]",
  Agreed: "text-[hsl(var(--accent))]",
  Asked: "text-muted-foreground",
  "Passed on": "text-muted-foreground",
};

/** Order the closing summary reads in: what stops a merge comes first. */
export const BUCKET_ORDER: Bucket[] = ["Blocks", "Asked", "Agreed", "Passed on"];

export const BUCKET_HEADING: Record<Bucket, string> = {
  Blocks: "Blocking",
  Agreed: "Agreed",
  Asked: "Questions for the author",
  "Passed on": "Passed on",
};
