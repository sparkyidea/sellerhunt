"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Strikethrough } from "lucide-react";
import type * as React from "react";
import { useToolbar } from "./toolbar-provider";

type ButtonProps = React.ComponentProps<typeof Button>;

function StrikeThroughToolbar({
  className,
  onClick,
  children,
  ref,
  ...props
}: ButtonProps) {
  const { editor } = useToolbar();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(
              "h-8 w-8 p-0 sm:h-9 sm:w-9",
              editor?.isActive("strike") && "bg-accent",
              className
            )}
            disabled={!editor?.can().chain().focus().toggleStrike().run()}
            onClick={(e) => {
              editor?.chain().focus().toggleStrike().run();
              onClick?.(e);
            }}
            ref={ref}
            size="icon"
            type="button"
            variant="ghost"
            {...props}
          >
            {children ?? <Strikethrough className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        <span>Strikethrough</span>
        <span className="ml-1 text-gray-11 text-xs">(cmd + shift + x)</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { StrikeThroughToolbar };
