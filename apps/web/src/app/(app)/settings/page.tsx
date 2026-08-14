import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserSettings } from "@/lib/settings";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const settings = await getUserSettings(session.user.id);
  const login = (session.user as { login?: string }).login ?? "";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Komodo", href: "/" }, { label: "Account" }, { label: "Settings" }]}
      />

      <PageBody width="narrow">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text tracking-tight">Settings</h1>
          <p className="text-sm text-text-dim mt-1">
            Defaults applied to every new review. Changes take effect on your next run.
          </p>
        </div>

        <SettingsForm initial={settings} login={login} />
      </PageBody>
    </>
  );
}
