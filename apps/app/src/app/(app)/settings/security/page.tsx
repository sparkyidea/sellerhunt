import { SecuritySettings } from "@dashseller/auth/components/auth/settings/security/security-settings";

export default function SecuritySettingsPage() {
  return (
    <div className="flex flex-col">
      <h1 className="font-semibold text-2xl">Security</h1>
      <SecuritySettings />
    </div>
  );
}
