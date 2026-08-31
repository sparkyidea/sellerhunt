import { Icons } from "@sparkyidea/ui/icons";
import type { SettingsNavConfig } from "@/types/settings-nav.type";

export function useSettingsNavConfig(): SettingsNavConfig {
  return {
    items: [
      {
        title: "Account",
        href: "/settings/account",
        icon: Icons.user,
      },
      {
        title: "Security",
        href: "/settings/security",
        icon: Icons.security,
      },
      {
        title: "Appearance",
        href: "/settings/appearance",
        icon: Icons.settings,
      },
    ],
  };
}
