"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Icons, type IconType } from "@sparkyidea/ui/icons";
import { useState } from "react";

import { DynamicLink } from "@/components/layout/dynamic-link";
import { cn } from "@/lib/utils";

interface BentoGridProps {
  children?: React.ReactNode;
  className?: string;
}

interface BentoCardProps {
  background?:
    | React.ReactNode
    | ((props: { isHovered: boolean }) => React.ReactNode);
  className?: string;
  cta?: string;
  description?: string | React.ReactNode;
  highlights?: string | React.ReactNode;
  href?: string;
  icon?: IconType;
  title: string;
}

export const BentoGrid = ({ className, children }: BentoGridProps) => (
  <div
    className={cn(
      "grid w-full auto-rows-[22rem] grid-cols-3 gap-2 md:gap-4",
      className
    )}
  >
    {children}
  </div>
);

export const BentoCard = ({
  icon: Icon,
  title,
  description,
  highlights,
  cta,
  href,
  background,
  className,
}: BentoCardProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <DynamicLink
      className={cn(
        "group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl bg-muted/50 shadow-lg outline outline-border hover:bg-muted/45 hover:outline-4 md:hover:outline-6",
        className
      )}
      href={cta ? undefined : href}
      key={title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "pointer-events-none z-10 mx-auto flex h-full flex-col items-center gap-1 px-6 py-8 text-center text-foreground md:h-full",

          highlights &&
            "md:mx-0 md:max-w-65 md:items-start md:pl-8 md:text-left"
        )}
      >
        {Icon && (
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border bg-secondary">
            <Icon className="h-6 w-6" />
          </div>
        )}

        <h2 className="h3">{title}</h2>

        <div className="flex flex-1 flex-col justify-between gap-2">
          <p className="text-muted-foreground text-sm">{description}</p>

          {highlights && (
            <span
              className={cn(
                "mt-10 hidden lg:block",

                cta &&
                  "transform-gpu transition-all duration-300 group-hover:-translate-y-10"
              )}
            >
              {highlights}
            </span>
          )}
        </div>
      </div>
      {typeof background === "function"
        ? background({ isHovered })
        : background}
      {cta && (
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 flex w-full translate-y-10 transform-gpu flex-row items-center px-6 py-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          )}
        >
          <DynamicLink href={href}>
            <Button
              className="pointer-events-auto hover:bg-primary hover:text-primary-foreground"
              size="sm"
              variant="secondary"
            >
              {cta}
              {href && <Icons.right className="ml-2 h-4 w-4" />}
            </Button>
          </DynamicLink>
        </div>
      )}
    </DynamicLink>
  );
};
