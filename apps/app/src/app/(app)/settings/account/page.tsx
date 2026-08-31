import { AccountSettings } from "@dashseller/auth/components/auth/settings/account/account-settings";

export default function AccountSettingsPage() {
  return (
    <div className="flex flex-col">
      <h1 className="font-semibold text-2xl">Account</h1>
      <AccountSettings />
    </div>
  );
}
