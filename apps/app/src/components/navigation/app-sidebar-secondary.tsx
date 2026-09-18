import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sparkyidea/ui/components/sidebar";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentPropsWithoutRef } from "react";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import type { AppNavSecondaryItem } from "@/types/app-nav.type";

export function SidebarSecondary({
  items,
  ...props
}: {
  items: AppNavSecondaryItem[];
} & ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

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
                    href={
                      item.isTracked
                        ? (`${item.url}?from=${encodeURIComponent(returnTo)}` as Route)
                        : item.url
                    }
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
