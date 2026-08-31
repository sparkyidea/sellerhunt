"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkyidea/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
} from "lucide-react";
import { MobileToolbarGroup, MobileToolbarItem } from "./mobile-toolbar-group";
import { useToolbar } from "./toolbar-provider";

const alignmentOptions = [
  {
    name: "Left Align",
    value: "left",
    icon: <AlignLeft className="size-4" />,
  },
  {
    name: "Center Align",
    value: "center",
    icon: <AlignCenter className="size-4" />,
  },
  {
    name: "Right Align",
    value: "right",
    icon: <AlignRight className="size-4" />,
  },
  {
    name: "Justify Align",
    value: "justify",
    icon: <AlignJustify className="size-4" />,
  },
];

function AlignmentTooolbar() {
  const { editor } = useToolbar();
  const isMobile = useIsMobile();

  const handleAlign = (value: string) => {
    editor?.chain().focus().setTextAlign(value).run();
  };

  const isDisabled =
    !editor || editor.isActive("image") || editor.isActive("video");

  const currentTextAlign = () => {
    if (editor?.isActive({ textAlign: "left" })) {
      return "left";
    }
    if (editor?.isActive({ textAlign: "center" })) {
      return "center";
    }
    if (editor?.isActive({ textAlign: "right" })) {
      return "right";
    }
    if (editor?.isActive({ textAlign: "justify" })) {
      return "justify";
    }
    return "left";
  };

  const findIndex = (value: string) =>
    alignmentOptions.findIndex((option) => option.value === value);

  if (isMobile) {
    const activeOption = alignmentOptions[findIndex(currentTextAlign())];
    return (
      <MobileToolbarGroup
        label={activeOption?.name ?? "Left Align"}
        trigger={
          <>
            {activeOption?.icon}
            <ChevronDown className="size-3" />
          </>
        }
      >
        {alignmentOptions.map((option) => (
          <MobileToolbarItem
            active={currentTextAlign() === option.value}
            key={option.value}
            onClick={() => handleAlign(option.value)}
          >
            <span className="mr-2">{option.icon}</span>
            {option.name}
          </MobileToolbarItem>
        ))}
      </MobileToolbarGroup>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              disabled={isDisabled}
              render={
                <Button size="sm" variant="ghost">
                  {alignmentOptions[findIndex(currentTextAlign())]?.icon}
                  <ChevronDown className="size-3" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Text Alignment</TooltipContent>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuGroup className="w-40">
          {alignmentOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => handleAlign(option.value)}
            >
              <span className="mr-2">{option.icon}</span>
              {option.name}
              {option.value === currentTextAlign() && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { AlignmentTooolbar };
