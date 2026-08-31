import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MaxWidthWrapper({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto max-w-6xl 2xl:max-w-screen-2xl", className)}>
      {children}
    </div>
  );
}
