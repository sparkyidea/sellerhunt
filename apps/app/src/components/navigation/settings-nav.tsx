"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { cn } from "@sparkyidea/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettingsNavConfig } from "@/configs/settings-nav.config";
import type { SettingsNavItem } from "@/types/settings-nav.type";
export function SettingsSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { items } = useSettingsNavConfig();

  return (
    <Card className={cn("h-full w-full shrink-0 gap-2 md:w-64", className)}>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-3">
        {items.map((item: SettingsNavItem) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground"
              )}
              href={item.href}
              key={item.href}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
