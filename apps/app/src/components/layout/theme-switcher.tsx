"use client";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sparkyidea/ui/components/sidebar";
import { Icons } from "@sparkyidea/ui/icons";
import { useTheme } from "next-themes";

export function ThemeSwitcher() {
  const { theme, setTheme, systemTheme } = useTheme();

  const toggle = () => {
    switch (theme) {
      case "light":
        setTheme("dark");
        break;
      case "dark":
        setTheme("light");
        break;
      default:
        if (systemTheme === "light") {
          setTheme("dark");
        } else {
          setTheme("light");
        }
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={toggle}
        tooltip={theme === "dark" ? "Dark" : "Light"}
      >
        <Icons.light className="flex dark:hidden" />
        <Icons.dark className="hidden dark:block" />
        <span className="whitespace-nowrap dark:hidden">Light</span>
        <span className="hidden whitespace-nowrap dark:flex">Dark</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
