import { HighlightGrid, type ItemType } from "@/components/highlight-grid";
import { cn } from "@/lib/utils";

interface HiddenPriceProps {
  className?: string;
  isHovered?: boolean;
}

export const HiddenPrice = ({ isHovered, className }: HiddenPriceProps) => {
  return (
    <div className={cn("flex", className)}>
      <HighlightGrid columns={2} isAnimated={isHovered} items={items} />
    </div>
  );
};

const items: ItemType[] = [
  { text: "Competitor A" },
  { text: "$32.89" },
  { text: "Your price", highlight: true },
  { text: "$29.99", highlight: true },
  { text: "Competitor B" },
  { text: "$31.99" },
  { text: "Competitor C" },
  { text: "$31.95" },
];
