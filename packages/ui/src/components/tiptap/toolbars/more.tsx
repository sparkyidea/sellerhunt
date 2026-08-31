"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sparkyidea/ui/components/popover";
import { Separator } from "@sparkyidea/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { cn } from "@sparkyidea/ui/lib/utils";
import {
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  MoreHorizontal,
  RemoveFormatting,
} from "lucide-react";
import { useToolbar } from "./toolbar-provider";

function MoreToolbar() {
  const { editor } = useToolbar();

  const handleOutdent = () => {
    if (editor?.can().liftListItem("listItem")) {
      editor.chain().focus().liftListItem("listItem").run();
    }
  };

  const handleIndent = () => {
    if (editor?.can().sinkListItem("listItem")) {
      editor.chain().focus().sinkListItem("listItem").run();
    }
  };

  const handleClearFormatting = () => {
    editor?.chain().focus().clearNodes().unsetAllMarks().run();
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button size="icon-sm" type="button" variant="ghost">
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>More</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-auto flex-row gap-0.5 p-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                className={cn(editor?.isActive("bulletList") && "bg-accent")}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <List className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Bullet list</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                className={cn(editor?.isActive("orderedList") && "bg-accent")}
                onClick={() =>
                  editor?.chain().focus().toggleOrderedList().run()
                }
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ListOrdered className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Numbered list</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                onClick={handleOutdent}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <IndentDecrease className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Outdent</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                onClick={handleIndent}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <IndentIncrease className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Indent</TooltipContent>
        </Tooltip>
        <Separator className="mx-1 h-6" orientation="vertical" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                onClick={handleClearFormatting}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <RemoveFormatting className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Clear formatting</TooltipContent>
        </Tooltip>
      </PopoverContent>
    </Popover>
  );
}

export { MoreToolbar };
