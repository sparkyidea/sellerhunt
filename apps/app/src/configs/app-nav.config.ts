import { Icons } from "@sparkyidea/ui/icons";
import type { AppNavMainItem, AppNavSecondaryItem } from "@/types/app-nav.type";

export function AppNavConfig() {
  const appNavMain: AppNavMainItem[] = [
    {
      title: "Explorer",
      url: "/explorer/listings",
      icon: Icons.radar,
      items: [{ title: "Listings", url: "/explorer/listings" }],
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
