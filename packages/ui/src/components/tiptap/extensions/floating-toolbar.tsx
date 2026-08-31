"use client";

import { ScrollArea, ScrollBar } from "@sparkyidea/ui/components/scroll-area";
import { Separator } from "@sparkyidea/ui/components/separator";
import { TooltipProvider } from "@sparkyidea/ui/components/tooltip";
import { useIsMobile } from "@sparkyidea/ui/hooks/use-mobile";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect } from "react";
import { AlignmentTooolbar } from "../toolbars/alignment";
import { BlockquoteToolbar } from "../toolbars/blockquote";
import { BoldToolbar } from "../toolbars/bold";
import { BulletListToolbar } from "../toolbars/bullet-list";
import { ColorHighlightToolbar } from "../toolbars/color-and-highlight";
import { HeadingsToolbar } from "../toolbars/headings";
import { ImagePlaceholderToolbar } from "../toolbars/image-placeholder-toolbar";
import { ItalicToolbar } from "../toolbars/italic";
import { LinkToolbar } from "../toolbars/link";
import { OrderedListToolbar } from "../toolbars/ordered-list";
import { ToolbarProvider } from "../toolbars/toolbar-provider";
import { UnderlineToolbar } from "../toolbars/underline";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

export function FloatingToolbar({ editor }: { editor: Editor | null }) {
  const isMobile = useIsMobile();

  // Prevent default context menu on mobile
  useEffect(() => {
    if (!(editor && isMobile)) {
      return;
    }

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const el = editor.view.dom;
    el.addEventListener("contextmenu", handleContextMenu);

    return () => el.removeEventListener("contextmenu", handleContextMenu);
  }, [editor, isMobile]);

  if (!editor) {
    return null;
  }

  return (
    <TooltipProvider>
      <BubbleMenu
        className="mx-0 w-full min-w-full rounded-sm border bg-background shadow-sm"
        editor={editor}
        options={{
          placement: "top",
          offset: 10,
        }}
        shouldShow={({ editor: ed }) => {
          // Read the media query live so the bubble hides immediately on
          // viewport resize (the plugin re-runs shouldShow on window resize).
          if (typeof window === "undefined") {
            return false;
          }
          if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
            return false;
          }
          return ed.isEditable && ed.isFocused;
        }}
      >
        <ToolbarProvider editor={editor}>
          <ScrollArea className="h-fit w-full py-0.5">
            <div className="flex items-center gap-0.5 px-2">
              <div className="flex items-center gap-0.5 p-1">
                {/* Primary formatting */}
                <BoldToolbar />
                <ItalicToolbar />
                <UnderlineToolbar />
                <Separator className="mx-1 h-6" orientation="vertical" />

                {/* Structure controls */}
                <HeadingsToolbar />
                <BulletListToolbar />
                <OrderedListToolbar />
                <Separator className="mx-1 h-6" orientation="vertical" />

                {/* Rich formatting */}
                <ColorHighlightToolbar />
                <LinkToolbar />
                <ImagePlaceholderToolbar />
                <Separator className="mx-1 h-6" orientation="vertical" />

                {/* Additional controls */}
                <AlignmentTooolbar />
                <BlockquoteToolbar />
              </div>
            </div>
            <ScrollBar className="h-0.5" orientation="horizontal" />
          </ScrollArea>
        </ToolbarProvider>
      </BubbleMenu>
    </TooltipProvider>
  );
}
