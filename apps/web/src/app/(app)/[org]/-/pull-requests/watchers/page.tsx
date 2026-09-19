import { Suspense } from "react";
import { WatchersView } from "@/components/pull-requests/watchers-view";

export default function WatchersPage() {
  return (
    <Suspense fallback={null}>
      <WatchersView />
    </Suspense>
  );
}
