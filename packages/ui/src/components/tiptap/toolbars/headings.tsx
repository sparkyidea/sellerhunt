"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkyidea/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import type * as React from "react";
import { MobileToolbarGroup, MobileToolbarItem } from "./mobile-toolbar-group";
import { useToolbar } from "./toolbar-provider";

const headingLevels = [1, 2, 3, 4, 5, 6] as const;

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.Ref<HTMLButtonElement>;
};

function getActiveLabel(
  editor: ReturnType<typeof useToolbar>["editor"]
): string {
  if (!editor) {
    return "Paragraph";
  }
  if (editor.isActive("blockquote")) {
    return "Blockquote";
  }
  for (const level of headingLevels) {
    if (editor.isActive("heading", { level })) {
      return `Heading ${level}`;
    }
  }
  return "Paragraph";
}

function HeadingsToolbar({ className, ref, ...props }: Props) {
  const { editor } = useToolbar();
  const isMobile = useIsMobile();
  const activeLabel = getActiveLabel(editor);

  if (isMobile) {
    return (
      <MobileToolbarGroup label={activeLabel}>
        <MobileToolbarItem
          active={
            !(editor?.isActive("heading") || editor?.isActive("blockquote"))
          }
          onClick={() => editor?.chain().focus().setParagraph().run()}
        >
          Paragraph
        </MobileToolbarItem>
        {headingLevels.map((level) => (
          <MobileToolbarItem
            active={editor?.isActive("heading", { level })}
            key={level}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level }).run()
            }
          >
            Heading {level}
          </MobileToolbarItem>
        ))}
        <MobileToolbarItem
          active={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          Blockquote
        </MobileToolbarItem>
      </MobileToolbarGroup>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className={cn(
                    activeLabel !== "Paragraph" && "bg-accent",
                    className
                  )}
                  ref={ref}
                  size="sm"
                  variant="ghost"
                  {...props}
                >
                  {activeLabel}
                  <ChevronDown className="size-3" />
                </Button>
              }
            />
            <DropdownMenuContent
              align="start"
              className="typography [&_h1]:!m-0 [&_h2]:!m-0 [&_h3]:!m-0 [&_h4]:!m-0 [&_h5]:!m-0 [&_h6]:!m-0 [&_h1]:!p-0 [&_h2]:!p-0 [&_h3]:!p-0 [&_h4]:!p-0 [&_h5]:!p-0 [&_h6]:!p-0 w-56"
            >
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={() => editor?.chain().focus().setParagraph().run()}
              >
                {editor?.isActive("heading") ||
                editor?.isActive("blockquote") ? (
                  <span className="size-4 shrink-0" />
                ) : (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
                <p className="!m-0">Paragraph</p>
              </DropdownMenuItem>
              {headingLevels.map((level) => {
                const Tag = `h${level}` as const;
                const isActive = editor?.isActive("heading", { level });
                return (
                  <DropdownMenuItem
                    className="flex items-center gap-2"
                    key={level}
                    onClick={() =>
                      editor?.chain().focus().toggleHeading({ level }).run()
                    }
                  >
                    {isActive ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                    <Tag className="!m-0 !border-0 !p-0">Heading {level}</Tag>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              >
                {editor?.isActive("blockquote") ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <blockquote className="!m-0">Blockquote</blockquote>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <TooltipContent>
        <span>Text style</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { HeadingsToolbar };
