"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Icons } from "@sparkyidea/ui/icons";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Props {
  className?: string | undefined;
  mode?: "icon" | "button";
  variant?: "secondary" | "ghost";
}

export function ThemeSwitcher({
  variant = "secondary",
  className,
  mode = "icon",
}: Props) {
  const { theme, setTheme, systemTheme } = useTheme();
  const isMobile = useIsMobile();

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const { clientX: x, clientY: y } = event;

    let newTheme: string;
    switch (theme) {
      case "light":
        newTheme = "dark";
        break;
      case "dark":
        newTheme = "light";
        break;
      case "system":
        newTheme = systemTheme === "light" ? "dark" : "light";
        break;
      default:
        newTheme = "dark";
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!document.startViewTransition || prefersReducedMotion || isMobile) {
      setTheme(newTheme);
      return;
    }

    document.documentElement.style.setProperty("--x", `${x}px`);
    document.documentElement.style.setProperty("--y", `${y}px`);

    document.startViewTransition(() => {
      setTheme(newTheme);
    });
  };

  if (mode === "icon") {
    return (
      <Button
        className={cn("rounded-full", className)}
        onClick={toggle}
        size="icon"
        variant={variant}
      >
        <Icons.theme className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      className={cn("flex w-full items-center justify-between p-0", className)}
      onClick={toggle}
      variant={variant}
    >
      <div className="flex items-center gap-2">
        <Icons.theme className="h-4 w-4" />
        <span>Theme</span>
      </div>
      <span className="capitalize dark:hidden">Light</span>
      <span className="hidden capitalize dark:block">Dark</span>
    </Button>
  );
}
