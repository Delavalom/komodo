import { Suspense } from "react";
import { QueueView } from "@/components/queue/view";
import { loadMechanicalChanges } from "@/lib/data/server";

export default async function QueuePage() {
  // Here rather than in the snapshot: it reads every open pull request's
  // patches, and this is the only page that sorts by them.
  const mechanical = await loadMechanicalChanges();
  return (
    <Suspense fallback={null}>
      <QueueView mechanical={mechanical} />
    </Suspense>
  );
}
