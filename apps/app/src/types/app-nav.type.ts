import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

export interface AppNavMainItem {
  icon: LucideIcon;
  items?: { title: string; url: Route }[];
  title: string;
  url?: Route;
}

export interface AppNavSecondaryItem {
  icon: LucideIcon;
  isTracked?: boolean;
  title: string;
  url: Route;
}
