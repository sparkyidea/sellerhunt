"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sparkyidea/ui/components/popover";
import { ScrollArea } from "@sparkyidea/ui/components/scroll-area";
import { Separator } from "@sparkyidea/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { MobileToolbarGroup, MobileToolbarItem } from "./mobile-toolbar-group";
import { useToolbar } from "./toolbar-provider";

const TEXT_COLORS = [
  { name: "Default", color: "var(--editor-text-default)" },
  { name: "Gray", color: "var(--editor-text-gray)" },
  { name: "Brown", color: "var(--editor-text-brown)" },
  { name: "Orange", color: "var(--editor-text-orange)" },
  { name: "Yellow", color: "var(--editor-text-yellow)" },
  { name: "Green", color: "var(--editor-text-green)" },
  { name: "Blue", color: "var(--editor-text-blue)" },
  { name: "Purple", color: "var(--editor-text-purple)" },
  { name: "Pink", color: "var(--editor-text-pink)" },
  { name: "Red", color: "var(--editor-text-red)" },
];

const HIGHLIGHT_COLORS = [
  { name: "Default", color: "var(--editor-highlight-default)" },
  { name: "Gray", color: "var(--editor-highlight-gray)" },
  { name: "Brown", color: "var(--editor-highlight-brown)" },
  { name: "Orange", color: "var(--editor-highlight-orange)" },
  { name: "Yellow", color: "var(--editor-highlight-yellow)" },
  { name: "Green", color: "var(--editor-highlight-green)" },
  { name: "Blue", color: "var(--editor-highlight-blue)" },
  { name: "Purple", color: "var(--editor-highlight-purple)" },
  { name: "Pink", color: "var(--editor-highlight-pink)" },
  { name: "Red", color: "var(--editor-highlight-red)" },
];

interface ColorHighlightButtonProps {
  color: string;
  isActive: boolean;
  isHighlight?: boolean;
  name: string;
  onClick: () => void;
}

function ColorHighlightButton({
  name,
  color,
  isActive,
  onClick,
  isHighlight,
}: ColorHighlightButtonProps) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-sm hover:bg-gray-3"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center space-x-2">
        <div
          className="rounded-sm border px-1 py-px font-medium"
          style={isHighlight ? { backgroundColor: color } : { color }}
        >
          A
        </div>
        <span>{name}</span>
      </div>
      {isActive && <CheckIcon className="size-4" />}
    </button>
  );
}

function ColorHighlightToolbar() {
  const { editor } = useToolbar();
  const isMobile = useIsMobile();

  const currentColor = editor?.getAttributes("textStyle").color;
  const currentHighlight = editor?.getAttributes("highlight").color;

  const handleSetColor = (color: string) => {
    editor
      ?.chain()
      .focus()
      .setColor(color === currentColor ? "" : color)
      .run();
  };

  const handleSetHighlight = (color: string) => {
    editor
      ?.chain()
      .focus()
      .setHighlight(color === currentHighlight ? { color: "" } : { color })
      .run();
  };

  const isDisabled = !(
    editor?.can().chain().setHighlight().run() &&
    editor?.can().chain().setColor("").run()
  );

  if (isMobile) {
    return (
      <div className="flex gap-1">
        <MobileToolbarGroup
          label="Color"
          trigger={
            <>
              <span className="text-md" style={{ color: currentColor }}>
                A
              </span>
              <ChevronDownIcon className="size-3" />
            </>
          }
        >
          {TEXT_COLORS.map(({ name, color }) => (
            <MobileToolbarItem
              active={currentColor === color}
              key={name}
              onClick={() => handleSetColor(color)}
            >
              <div className="flex items-center gap-2">
                <div className="rounded-sm border px-2" style={{ color }}>
                  A
                </div>
                <span>{name}</span>
              </div>
            </MobileToolbarItem>
          ))}
        </MobileToolbarGroup>

        <MobileToolbarGroup
          label="Highlight"
          trigger={
            <>
              <span
                className="rounded-sm px-1 text-md"
                style={{ backgroundColor: currentHighlight }}
              >
                A
              </span>
              <ChevronDownIcon className="size-3" />
            </>
          }
        >
          {HIGHLIGHT_COLORS.map(({ name, color }) => (
            <MobileToolbarItem
              active={currentHighlight === color}
              key={name}
              onClick={() => handleSetHighlight(color)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="rounded-sm border px-2"
                  style={{ backgroundColor: color }}
                >
                  A
                </div>
                <span>{name}</span>
              </div>
            </MobileToolbarItem>
          ))}
        </MobileToolbarGroup>
      </div>
    );
  }

  return (
    <Popover>
      <div className="relative h-full">
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                disabled={isDisabled}
                render={
                  <Button
                    size="sm"
                    style={{ color: currentColor }}
                    variant="ghost"
                  >
                    <span className="text-md">A</span>
                    <ChevronDownIcon className="size-3" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent>Text Color & Highlight</TooltipContent>
        </Tooltip>

        <PopoverContent align="start" className="w-56 p-1 dark:bg-gray-2">
          <ScrollArea className="mt-2 max-h-80 overflow-y-auto pr-2">
            <div className="mt-2 mb-2.5 px-2 text-gray-11 text-xs">Color</div>
            {TEXT_COLORS.map(({ name, color }) => (
              <ColorHighlightButton
                color={color}
                isActive={currentColor === color}
                key={name}
                name={name}
                onClick={() => handleSetColor(color)}
              />
            ))}

            <Separator className="my-3" />

            <div className="mb-2.5 w-full px-2 pr-3 text-gray-11 text-xs">
              Background
            </div>
            {HIGHLIGHT_COLORS.map(({ name, color }) => (
              <ColorHighlightButton
                color={color}
                isActive={currentHighlight === color}
                isHighlight
                key={name}
                name={name}
                onClick={() => handleSetHighlight(color)}
              />
            ))}
          </ScrollArea>
        </PopoverContent>
      </div>
    </Popover>
  );
}

export { ColorHighlightToolbar };
