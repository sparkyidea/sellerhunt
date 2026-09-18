"use client";

import { QuerySyncProvider } from "@sparkyidea/dataview/providers";
import { PanelMain } from "@sparkyidea/ui/components/panel-root";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The owning pathname is captured in published content; the live one may change. */
function PanelQueryScope({
  children,
  pathname,
}: {
  children?: ReactNode;
  pathname: string;
}) {
  const currentPathname = usePathname();
  return (
    <QuerySyncProvider paused={currentPathname !== pathname}>
      {children}
    </QuerySyncProvider>
  );
}

/** Next.js adapter. Providers needed by retained content belong inside it. */
export function PanelRoute({
  children,
  error = false,
}: {
  children?: ReactNode;
  error?: boolean;
}) {
  const pathname = usePathname();
  return (
    <PanelMain id={pathname} replace={error}>
      <PanelQueryScope pathname={pathname}>{children}</PanelQueryScope>
    </PanelMain>
  );
}
