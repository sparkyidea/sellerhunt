import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sparkyidea/ui/components/sidebar";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import type { AppNavSecondaryItem } from "@/types/app-nav.type";
import { useSettingsNavigation } from "./navigation-area";

export function SidebarSecondary({
  items,
  ...props
}: {
  items: AppNavSecondaryItem[];
} & ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { openSettings } = useSettingsNavigation();

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          <ThemeSwitcher />
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={
                  <Link
                    href={item.url}
                    // Tracked items remember where they were opened from so
                    // closing returns there. SPA navigations only, by design:
                    // a new tab has no origin and closes to home.
                    onNavigate={item.isTracked ? openSettings : undefined}
                  />
                }
                tooltip={item.title}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
