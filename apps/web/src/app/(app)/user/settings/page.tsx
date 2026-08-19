import { redirect } from "next/navigation";

export default function PersonalSettingsIndex() {
  redirect("/user/settings/account");
}
