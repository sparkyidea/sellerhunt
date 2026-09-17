import { Icons } from "@sparkyidea/ui/icons";
import type { AppNavMainItem, AppNavSecondaryItem } from "@/types/app-nav.type";

export function AdminNavConfig() {
  const appNavMain: AppNavMainItem[] = [
    {
      title: "Mobile profiles",
      url: "/admin/mobile-profiles",
      icon: Icons.security,
    },
  ];
  const appNavSecondary: AppNavSecondaryItem[] = [
    {
      title: "Help",
      url: "mailto:help@turboitem.com",
      icon: Icons.help,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Icons.settings,
      isTracked: true,
    },
  ];
  return { appNavMain, appNavSecondary };
}
