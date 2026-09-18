"use client";

import { PanelExpand } from "@sparkyidea/ui/components/panel";
import { usePanel } from "@sparkyidea/ui/components/panel-root";
import type { Route } from "next";
import Link from "next/link";

/** Normal links retain new-tab / modifier-click behavior and mobile routing. */
export function PreviewExpandLink({ href }: { href: string }) {
  const { expand } = usePanel();
  return (
    <PanelExpand render={<Link href={href as Route} onNavigate={expand} />} />
  );
}
