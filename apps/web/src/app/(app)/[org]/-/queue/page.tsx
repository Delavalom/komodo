import { Suspense } from "react";
import { QueueView } from "@/components/queue/view";

export default function QueuePage() {
  return (
    <Suspense fallback={null}>
      <QueueView />
    </Suspense>
  );
}
