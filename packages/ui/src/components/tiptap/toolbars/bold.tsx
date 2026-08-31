"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import { BoldIcon } from "lucide-react";
import type * as React from "react";
import { useToolbar } from "./toolbar-provider";

type ButtonProps = React.ComponentProps<typeof Button>;

function BoldToolbar({
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
            className={cn(editor?.isActive("bold") && "bg-accent", className)}
            disabled={!editor?.can().chain().focus().toggleBold().run()}
            onClick={(e) => {
              editor?.chain().focus().toggleBold().run();
              onClick?.(e);
            }}
            ref={ref}
            size="icon-sm"
            variant="ghost"
            {...props}
          >
            {children ?? <BoldIcon className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        <span>Bold</span>
        <span className="ml-1 text-gray-11 text-xs">(cmd + b)</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { BoldToolbar };
