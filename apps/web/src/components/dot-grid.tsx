"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Icons, type IconType } from "@sparkyidea/ui/icons";
import { useState } from "react";
import { DynamicLink } from "@/components/layout/dynamic-link";
import { cn } from "@/lib/utils";

interface DotGridProps {
  children?: React.ReactNode;
  className?: string;
}

interface DotCardProps {
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

export const DotGrid = ({ className, children }: DotGridProps) => {
  return (
    <div className="flex w-full flex-row">
      <div className="hidden flex-col md:flex">
        <div className="flex h-16 w-8 border-r-[1.5px] border-b-[1.5px] border-dashed" />
        <div className="flex flex-1" />
        <div className="flex h-16 w-8 border-t-[1.5px] border-r-[1.5px] border-dashed" />
      </div>
      <div
        className={cn(
          "grid w-full grid-cols-3 border-t-[1.5px] border-dashed md:-mx-[1.5px] md:my-[62.5px] md:border-l-[1.5px]",
          className
        )}
      >
        {children}
      </div>
      <div className="hidden flex-col md:flex">
        <div className="flex h-16 w-8 border-b-[1.5px] border-l-[1.5px] border-dashed" />
        <div className="flex flex-1" />
        <div className="flex h-16 w-8 border-t-[1.5px] border-l-[1.5px] border-dashed" />
      </div>
    </div>
  );
};

export const DotCard = ({
  icon: Icon,
  title,
  description,
  highlights,
  cta,
  href,
  background,
  className,
}: DotCardProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <DynamicLink
      className={cn(
        "group relative col-span-3 flex flex-col justify-between overflow-hidden border-r-[1.5px] border-b-[1.5px] border-dashed",
        className
      )}
      href={cta ? undefined : href}
      key={title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "pointer-events-none z-10 flex h-full flex-col gap-1 p-4 text-foreground md:h-full md:p-8",
          highlights && "md:max-w-75"
        )}
      >
        {Icon && (
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border bg-secondary">
            <Icon className="h-6 w-6" />
          </div>
        )}

        <h2 className="font-medium text-2xl">{title}</h2>

        <div className="flex flex-1 flex-col justify-between gap-2">
          <p
            className={cn(
              "text-muted-foreground text-sm",
              highlights && "md:text-balance"
            )}
          >
            {description}
          </p>

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
              className={cn(
                "pointer-events-auto hover:bg-secondary-foreground hover:text-secondary",
                href
                  ? "cursor-pointer hover:bg-primary hover:text-primary-foreground"
                  : "cursor-default"
              )}
              size="sm"
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
