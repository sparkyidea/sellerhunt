"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@sparkyidea/ui/components/sidebar";
import { cn } from "@sparkyidea/ui/lib/utils";
import type * as React from "react";
import { AppNavConfig } from "@/configs/app-nav.config";
import { SidebarSecondary } from "./app-sidebar-secondary";
import { SidebarMain } from "./sidebar-main";

export function AppSidebar({
  className,
  style,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar();
  const { appNavMain, appNavSecondary } = AppNavConfig();

  const mobileStyle = isMobile
    ? ({
        "--sidebar-background": "var(--header-background)",
        "--sidebar-foreground": "var(--header-foreground)",
        "--sidebar-primary":
          "color-mix(in oklab, var(--header-foreground) 12%, transparent)",
        "--sidebar-primary-foreground": "var(--header-foreground)",
        "--sidebar-accent": "var(--header-accent)",
        "--sidebar-accent-foreground": "var(--header-accent-foreground)",
        "--sidebar-border": "var(--header-border)",
        "--sidebar-ring": "var(--header-ring)",
      } as React.CSSProperties)
    : undefined;

  return (
    <Sidebar
      className={cn(
        "h-full",
        isMobile
          ? "top-14 max-h-[75dvh] rounded-b-xl"
          : "absolute *:data-[slot=sidebar-inner]:overflow-hidden *:data-[slot=sidebar-inner]:rounded-tl-xl *:data-[slot=sidebar-inner]:border-t *:data-[slot=sidebar-inner]:border-l",
        className
      )}
      style={{ ...mobileStyle, ...style }}
      {...props}
    >
      <SidebarContent>
        <SidebarMain items={appNavMain} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarSecondary items={appNavSecondary} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
