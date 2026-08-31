import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

export interface SettingsNavItem {
  href: Route;
  icon: LucideIcon;
  title: string;
}

export interface SettingsNavConfig {
  items: SettingsNavItem[];
}
