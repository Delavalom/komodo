import { Suspense } from "react";
import { CustomRulesView } from "@/components/memory/custom-rules-view";

export default function CustomRulesPage() {
  return (
    <Suspense fallback={null}>
      <CustomRulesView />
    </Suspense>
  );
}
