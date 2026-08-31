"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import { SeparatorHorizontal } from "lucide-react";
import type * as React from "react";
import { useToolbar } from "./toolbar-provider";

type ButtonProps = React.ComponentProps<typeof Button>;

function HorizontalRuleToolbar({
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
            className={cn("h-8 w-8 p-0 sm:h-9 sm:w-9", className)}
            onClick={(e) => {
              editor?.chain().focus().setHorizontalRule().run();
              onClick?.(e);
            }}
            ref={ref}
            size="icon"
            type="button"
            variant="ghost"
            {...props}
          >
            {children ?? <SeparatorHorizontal className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        <span>Horizontal Rule</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { HorizontalRuleToolbar };
