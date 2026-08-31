import type React from "react";

import { cn } from "@/lib/utils";

export interface ItemType {
  highlight?: boolean;
  isAnimated?: boolean;
  text: string;
}

interface HighlightCardInternalProps extends ItemType {
  columns: number;
  index: number;
}

interface HighlightGridProps {
  className?: string;
  columns?: number;
  isAnimated?: boolean;
  items: ItemType[];
}

const HighlightCard: React.FC<HighlightCardInternalProps> = ({
  text,
  highlight = false,
  index,
  columns,
  isAnimated = true,
}) => {
  const isFirstInRow = index % columns === 0;
  const isLastInRow = (index + 1) % columns === 0 || index === columns - 1;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-center px-4 py-3 text-muted text-sm outline-[3px] outline-border transition-[outline] duration-100 ease-in-out",
        !(isFirstInRow || isLastInRow) && "rounded-md",
        isFirstInRow && "rounded-r-md",
        isLastInRow && "rounded-l-md",
        highlight && "outline-primary"
      )}
    >
      <span
        className={cn(
          "font-medium text-muted-foreground/70",
          highlight &&
            "font-bold text-primary blur-sm transition-all duration-100 ease-in-out",
          isAnimated && "blur-none"
        )}
      >
        {text}
      </span>
    </div>
  );
};

export const HighlightGrid: React.FC<HighlightGridProps> = ({
  items,
  columns = 2,
  isAnimated = true,
  className,
}) => {
  const gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;

  return (
    <div
      className={cn("group grid w-full gap-4", className)}
      style={{ gridTemplateColumns }}
    >
      {items.map((item, index) => (
        <HighlightCard
          key={index}
          {...item}
          columns={columns}
          index={index}
          isAnimated={isAnimated}
        />
      ))}
    </div>
  );
};
