import type { Metadata } from "next";

import { ReportPage } from "@/components/marketing/report-page";

export const metadata: Metadata = {
  title: "State of AI Coding 2026",
  description:
    "What changed once agents started writing a serious share of the code, and what it did to review.",
};

/**
 * docs/SPEC-MARKETING.md §M10.11.
 *
 * The original publishes this report at two paths — the short one linked from
 * the footer and this one under /reports/. Both are live, and both render the
 * same report, as they do on the original.
 */
export default function ReportsStateOfAiCodingPage() {
  return <ReportPage canonicalPath="/reports/state-of-ai-coding" />;
}
