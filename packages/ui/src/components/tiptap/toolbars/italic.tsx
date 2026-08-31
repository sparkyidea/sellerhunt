"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import { ItalicIcon } from "lucide-react";
import type * as React from "react";
import { useToolbar } from "./toolbar-provider";

type ButtonProps = React.ComponentProps<typeof Button>;

function ItalicToolbar({
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
            className={cn(editor?.isActive("italic") && "bg-accent", className)}
            disabled={!editor?.can().chain().focus().toggleItalic().run()}
            onClick={(e) => {
              editor?.chain().focus().toggleItalic().run();
              onClick?.(e);
            }}
            ref={ref}
            size="icon-sm"
            type="button"
            variant="ghost"
            {...props}
          >
            {children ?? <ItalicIcon className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        <span>Italic</span>
        <span className="ml-1 text-gray-11 text-xs">(cmd + i)</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { ItalicToolbar };
