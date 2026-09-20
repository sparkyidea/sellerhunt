import { redirect } from "next/navigation";

// /settings has no content of its own; Account is the default tab. The page
// to return to on close is remembered in memory by useSettingsOrigin.
export default function SettingsPage() {
  redirect("/settings/account");
}
