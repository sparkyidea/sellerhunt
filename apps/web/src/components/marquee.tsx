import { cn } from "@/lib/utils";

interface MarqueeProps {
  children?: React.ReactNode;
  className?: string;
  isAnimated?: boolean;
  offset?: number;
  repeat?: number;
  reverse?: boolean;
  vertical?: boolean;
}

export function Marquee({
  className,
  reverse,
  isAnimated = true,
  offset = 0,
  children,
  vertical = false,
  repeat = 4,
}: MarqueeProps) {
  return (
    <div
      className={cn(
        "group flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] [gap:var(--gap)]",
        vertical ? "flex-col" : "flex-row",
        className
      )}
      style={{ "--marquee-start": offset } as React.CSSProperties}
    >
      {new Array(repeat).fill(0).map((_, i) => (
        <div
          className={cn(
            "flex shrink-0 justify-around [gap:var(--gap)]",
            vertical
              ? "animate-marquee-vertical flex-col"
              : "animate-marquee flex-row",
            !isAnimated && "[animation-play-state:paused]",
            reverse && "[animation-direction:reverse]"
          )}
          key={i}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
