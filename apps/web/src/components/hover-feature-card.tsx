"use client";

import { DynamicLink } from "@/components/layout/dynamic-link";
import { cn } from "@/lib/utils";

interface HoverFeatureCardProps {
  className?: string;
  description: string;
  icon: React.ReactNode;
  title: string;
}

export const HoverFeatureCard = ({
  icon,
  title,
  description,
  className,
}: HoverFeatureCardProps) => {
  return (
    <DynamicLink
      className={cn(
        "group/feature relative flex flex-col justify-between overflow-hidden p-8",
        className
      )}
    >
      <div className="z-10 flex flex-col items-center gap-2 md:items-start">
        <div className="absolute top-1/2 left-0 hidden h-6 w-1 origin-center -translate-y-1/2 rounded-tr-full rounded-br-full bg-muted transition-all duration-200 group-hover/feature:h-8 group-hover/feature:bg-primary md:block" />
        <div className="mb-2 text-muted-foreground">{icon}</div>
        <h3 className="inline-block text-center font-bold text-lg text-secondary-foreground transition duration-200 md:text-left md:group-hover/feature:translate-x-2">
          {title}
        </h3>
        <p className="text-center text-muted-foreground text-sm md:text-left">
          {description}
        </p>
      </div>
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-b from-background to-secondary opacity-0 transition-opacity duration-300 group-hover/feature:opacity-100 md:bg-gradient-to-l"
        )}
      />
    </DynamicLink>
  );
};

export const HoverFeatureGrid = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="flex w-full flex-row">
      <div
        className={cn(
          "md:cell-divider-cols-2 lg:cell-divider-cols-4 grid w-full grid-cols-1 md:grid-cols-2 md:border-x-[1.5px] lg:grid-cols-4",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
};
