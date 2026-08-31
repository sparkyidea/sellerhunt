import { cn } from "@sparkyidea/ui/lib/utils";

interface AnimatedMenuIconProps {
  className?: string;
  isOpen: boolean;
}

export function AnimatedMenuIcon({ className, isOpen }: AnimatedMenuIconProps) {
  return (
    <div aria-hidden="true" className={cn("relative size-4", className)}>
      <span
        className={cn(
          "absolute inset-x-0 mx-auto block h-[1.5px] w-3.5 rounded bg-current transition-all duration-100",
          isOpen ? "top-1/2 -translate-y-1/2 -rotate-45" : "top-1"
        )}
      />
      <span
        className={cn(
          "absolute inset-x-0 mx-auto block h-[1.5px] w-3.5 rounded bg-current transition-all duration-100",
          isOpen ? "top-1/2 -translate-y-1/2 rotate-45" : "top-2.5"
        )}
      />
    </div>
  );
}
