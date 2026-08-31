import { cn } from "@sparkyidea/ui/lib/utils";
import type { ReactNode } from "react";

export interface SectionHeaderProps {
  /** Optional trailing action (e.g. a button) aligned to the trailing edge. */
  action?: ReactNode;
  className?: string;
  title: ReactNode;
  /** Extra classes for the title element, e.g. `text-destructive`. */
  titleClassName?: string;
}

/**
 * Fixed-height header for a settings / organization card section.
 *
 * The row height is locked to a small button's height (`h-7`) so that sections
 * with a trailing action (e.g. "Create organization") and text-only sections
 * share the exact same header height. This keeps the card below at a consistent
 * vertical position across settings pages, so switching pages doesn't make the
 * layout jump up and down.
 */
export function SectionHeader({
  action,
  className,
  title,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-3 flex h-7 items-end justify-between gap-3")}>
      <h2 className={cn("truncate font-semibold text-sm", className)}>
        {title}
      </h2>

      {action}
    </div>
  );
}
