"use client";

import { PanelMain } from "@sparkyidea/ui/components/panel-root";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Route boundary: render once, or report an error replacing a promoted preview. */
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
      {children}
    </PanelMain>
  );
}
