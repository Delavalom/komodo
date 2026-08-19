import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";

/** SPEC §7.3 */
export default function KnowledgeBasePage() {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
      <Card>
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="No knowledge base yet"
          description="Greptile hasn't built a knowledge base for these repositories yet. As it reviews more pull requests, the docs it learns will show up here."
        />
      </Card>
    </div>
  );
}
