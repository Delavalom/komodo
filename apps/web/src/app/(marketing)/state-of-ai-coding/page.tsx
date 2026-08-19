import type { Metadata } from "next";

import { ReportPage } from "@/components/marketing/report-page";

export const metadata: Metadata = {
  title: "State of AI Coding 2026",
  description:
    "What changed once agents started writing a serious share of the code, and what it did to review.",
};

/** docs/SPEC-MARKETING.md §M10.11. */
export default function StateOfAiCodingPage() {
  return <ReportPage canonicalPath="/state-of-ai-coding" />;
}
