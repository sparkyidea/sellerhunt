"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import { UnderlineIcon } from "lucide-react";
import type * as React from "react";
import { useToolbar } from "./toolbar-provider";

type ButtonProps = React.ComponentProps<typeof Button>;

function UnderlineToolbar({
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
              editor?.isActive("underline") && "bg-accent",
              className
            )}
            disabled={!editor?.can().chain().focus().toggleUnderline().run()}
            onClick={(e) => {
              editor?.chain().focus().toggleUnderline().run();
              onClick?.(e);
            }}
            ref={ref}
            size="icon-sm"
            type="button"
            variant="ghost"
            {...props}
          >
            {children ?? <UnderlineIcon className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        <span>Underline</span>
        <span className="ml-1 text-gray-11 text-xs">(cmd + u)</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { UnderlineToolbar };
