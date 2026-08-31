"use client";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@sparkyidea/ui/components/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentPropsWithoutRef } from "react";
import type { AppNavMainItem } from "@/types/app-nav.type";

export function SidebarMain({
  items,
  ...props
}: {
  items: AppNavMainItem[];
} & ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname();

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const isParentActive = (item: AppNavMainItem) => {
    if (item.url && isActive(item.url)) {
      return true;
    }
    return item.items?.some((sub) => isActive(sub.url)) ?? false;
  };

  return (
    <SidebarGroup {...props} className="pt-0 md:pt-2.5">
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            {item.url ? (
              <SidebarMenuButton
                isActive={isActive(item.url)}
                render={<Link href={item.url} />}
                tooltip={item.title}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton tooltip={item.title}>
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            )}
            {isParentActive(item) && item.items?.length ? (
              <SidebarMenuSub>
                {item.items.map((subItem) => (
                  <SidebarMenuSubItem key={subItem.title}>
                    <SidebarMenuSubButton
                      isActive={isActive(subItem.url)}
                      render={<Link href={subItem.url} />}
                    >
                      <span>{subItem.title}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
