import { Suspense } from "react";
import { PullRequestsView } from "@/components/pull-requests/view";

export default function PullRequestsPage() {
  return (
    <Suspense fallback={null}>
      <PullRequestsView />
    </Suspense>
  );
}
