"use client";

import { PanelExpand } from "@sparkyidea/ui/components/panel";
import type { Route } from "next";
import Link from "next/link";
import { createContext, useContext } from "react";

export const PanelViewContext = createContext<{
  mode: "main" | "preview";
  expand?: () => void;
}>({ mode: "main" });

export function usePanelView() {
  return useContext(PanelViewContext);
}

/** Normal links retain new-tab / modifier-click behavior and mobile routing. */
export function PreviewExpand({ href }: { href: string }) {
  const { expand } = usePanelView();
  return (
    <PanelExpand render={<Link href={href as Route} onNavigate={expand} />} />
  );
}
