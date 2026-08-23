import { Suspense } from "react";
import { AnalyticsView } from "@/components/analytics/view";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsView />
    </Suspense>
  );
}
