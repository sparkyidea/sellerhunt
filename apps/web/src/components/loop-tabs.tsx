"use client";

import { Tabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function LoopTabs({ className, ...props }: ComponentProps<typeof Tabs.Root>) {
  return (
    <Tabs.Root
      className={cn("flex flex-col gap-2", className)}
      data-slot="tabs"
      {...props}
    />
  );
}

function LoopTabsContent({
  className,
  ...props
}: ComponentProps<typeof Tabs.Panel>) {
  return (
    <Tabs.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

function LoopTabsList({
  className,
  ...props
}: ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn(
        "inline-flex h-auto w-fit items-center justify-center gap-6 bg-transparent pb-2",
        className
      )}
      data-slot="animated-tabs-list"
      {...props}
    />
  );
}

function LoopTabsTrigger({
  className,
  ...props
}: ComponentProps<typeof Tabs.Tab>) {
  return (
    <Tabs.Tab
      className={cn(
        "!px-1 relative inline-flex cursor-pointer items-center justify-center gap-1.5 py-3",
        "text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        "data-[selected]:text-primary",
        // Transitions
        "transition-colors duration-300",
        "after:transition-[width] after:duration-300 after:ease-in-out",
        // Pseudo-elements base styles
        "before:absolute before:bottom-0 before:left-0 before:h-1 before:w-0 before:rounded-full",
        "after:absolute after:bottom-0 after:left-0 after:h-1 after:w-0 after:rounded-full",
        // Pseudo-elements colors and states
        "before:bg-muted-foreground hover:before:w-full",
        "after:bg-primary data-[selected]:after:w-full",
        className
      )}
      data-slot="animated-tabs-trigger"
      {...props}
    />
  );
}

export { LoopTabs, LoopTabsContent, LoopTabsList, LoopTabsTrigger };
