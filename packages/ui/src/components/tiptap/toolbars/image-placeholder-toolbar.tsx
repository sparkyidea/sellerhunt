"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Image as ImageIcon } from "lucide-react";
import type * as React from "react";
import { useToolbar } from "./toolbar-provider";

type ButtonProps = React.ComponentProps<typeof Button>;

function ImagePlaceholderToolbar({
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
              editor?.isActive("image-placeholder") && "bg-accent",
              className
            )}
            onClick={(e) => {
              e.preventDefault();
              editor?.chain().focus().insertImagePlaceholder().run();
              onClick?.(e);
            }}
            ref={ref}
            size="icon-sm"
            type="button"
            variant="ghost"
            {...props}
          >
            {children ?? <ImageIcon className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        <span>Image</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { ImagePlaceholderToolbar };
