import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBalance } from "@/lib/credits";
import { ReviewForm } from "./review-form";

export default async function NewReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const balance = await getBalance(session.user.id);

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-1" style={{ color: "#E5E7EB" }}>
        New review
      </h1>
      <p className="text-sm mb-8" style={{ color: "#6B7280" }}>
        Paste a GitHub PR URL, pick a model, and Komodo will review it using your GitHub token.
      </p>

      <div className="rounded-xl p-6" style={{ backgroundColor: "#111318", border: "1px solid #1E2128" }}>
        <ReviewForm balance={balance} />
      </div>
    </div>
  );
}
