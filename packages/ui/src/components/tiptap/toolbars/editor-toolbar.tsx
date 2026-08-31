"use client";

import { Separator } from "@sparkyidea/ui/components/separator";
import { TooltipProvider } from "@sparkyidea/ui/components/tooltip";
import type { Editor } from "@tiptap/core";
import { AlignmentTooolbar } from "./alignment";
import { BoldToolbar } from "./bold";
import { CodeToolbar } from "./code";
import { ColorHighlightToolbar } from "./color-and-highlight";
import { HeadingsToolbar } from "./headings";
import { ImagePlaceholderToolbar } from "./image-placeholder-toolbar";
import { ItalicToolbar } from "./italic";
import { LinkToolbar } from "./link";
import { MoreToolbar } from "./more";
import { SourceViewToolbar } from "./source-view";
import { ToolbarProvider } from "./toolbar-provider";
import { UnderlineToolbar } from "./underline";

interface EditorToolbarProps {
  editor: Editor;
  onToggleSourceMode?: () => void;
  sourceMode?: boolean;
}

function EditorToolbar({
  editor,
  sourceMode,
  onToggleSourceMode,
}: EditorToolbarProps) {
  return (
    <div className="sticky top-0 z-20 hidden w-full border-b bg-background sm:block">
      <ToolbarProvider editor={editor}>
        <TooltipProvider>
          <div className="flex items-center gap-1 p-1">
            {/* Formatting (Paragraph / Headings) */}
            <HeadingsToolbar />
            <Separator orientation="vertical" />

            {/* Basic marks */}
            <BoldToolbar />
            <ItalicToolbar />
            <UnderlineToolbar />
            <ColorHighlightToolbar />
            <Separator orientation="vertical" />

            {/* Alignment */}
            <AlignmentTooolbar />
            <Separator orientation="vertical" />

            {/* Insert: link, image */}
            <LinkToolbar />
            <ImagePlaceholderToolbar />
            <CodeToolbar />
            <Separator orientation="vertical" />

            {/* More (bullet, ordered, outdent, indent, clear) */}
            <MoreToolbar />

            <div className="ml-auto">
              {onToggleSourceMode && (
                <SourceViewToolbar
                  active={sourceMode ?? false}
                  onToggle={onToggleSourceMode}
                />
              )}
            </div>
          </div>
        </TooltipProvider>
      </ToolbarProvider>
    </div>
  );
}

export { EditorToolbar };
