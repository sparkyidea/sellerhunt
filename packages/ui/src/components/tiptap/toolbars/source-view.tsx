"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Code } from "lucide-react";

interface SourceViewToolbarProps {
  active: boolean;
  onToggle: () => void;
}

function SourceViewToolbar({ active, onToggle }: SourceViewToolbarProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(active && "bg-accent")}
            onClick={onToggle}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Code className="size-4" />
          </Button>
        }
      />
      <TooltipContent>
        <span>View HTML</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { SourceViewToolbar };
