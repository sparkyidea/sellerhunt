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
        title: "Organizations",
        href: "/settings/organizations",
        icon: Icons.organization,
      },
      {
        title: "Appearance",
        href: "/settings/appearance",
        icon: Icons.settings,
      },
      {
        title: "Channels",
        href: "/settings/channels",
        icon: Icons.store,
      },
    ],
  };
}
