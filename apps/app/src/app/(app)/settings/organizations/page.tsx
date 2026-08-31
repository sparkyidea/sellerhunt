import { OrganizationsSettings } from "@dashseller/auth/components/auth/organization/organizations-settings";

export default function OrganizationsSettingsPage() {
  return (
    <div className="flex flex-col">
      <h3 className="font-bold text-2xl tracking-tight">Organizations</h3>
      <OrganizationsSettings />
    </div>
  );
}
