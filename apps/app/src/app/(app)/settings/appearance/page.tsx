import { AppearanceSettings } from "@/components/settings/appearance-settings";

export default function AppearanceSettingsPage() {
  return (
    <div className="flex flex-col">
      <h1 className="font-semibold text-2xl">Appearance</h1>
      <AppearanceSettings />
    </div>
  );
}
