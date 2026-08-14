import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBalance } from "@/lib/credits";
import { getUserSettings } from "@/lib/settings";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { ReviewForm } from "./review-form";

export default async function NewReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [balance, settings] = await Promise.all([
    getBalance(session.user.id),
    getUserSettings(session.user.id),
  ]);

  return (
    <>
      <PageHeader crumbs={[{ label: "Komodo", href: "/" }, { label: "New review" }]} />

      <PageBody width="narrow">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text tracking-tight">New review</h1>
          <p className="text-sm text-text-dim mt-1">
            Paste a GitHub pull request URL, pick a model, and Komodo reviews it with your GitHub
            token.
          </p>
        </div>

        <ReviewForm balance={balance} defaultModel={settings.defaultModel} />
      </PageBody>
    </>
  );
}
