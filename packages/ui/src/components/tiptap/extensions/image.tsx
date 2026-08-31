/** biome-ignore-all lint/a11y/noStaticElementInteractions: upstream shadcn-tiptap source */
/** biome-ignore-all lint/a11y/noNoninteractiveElementInteractions: upstream shadcn-tiptap resize handles */
/** biome-ignore-all lint/performance/noImgElement: NodeView renders native img */
/** biome-ignore-all lint/correctness/useImageSize: upstream shadcn-tiptap source */
"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sparkyidea/ui/components/dropdown-menu";
import { Separator } from "@sparkyidea/ui/components/separator";
import { duplicateContent } from "@sparkyidea/ui/lib/tiptap-utils";
import { cn } from "@sparkyidea/ui/lib/utils";
import Image from "@tiptap/extension-image";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Maximize,
  MoreVertical,
  Trash,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const ImageExtension = Image.extend({
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: "100%",
      },
      height: {
        default: null,
      },
      align: {
        default: "center",
      },
    };
  },

  addNodeView: () => {
    return ReactNodeViewRenderer(TiptapImage);
  },
});

function TiptapImage(props: NodeViewProps) {
  const { node, editor, selected, deleteNode, updateAttributes } = props;
  const imageRef = useRef<HTMLImageElement | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resizingPosition, setResizingPosition] = useState<"left" | "right">(
    "left"
  );
  const [resizeInitialWidth, setResizeInitialWidth] = useState(0);
  const [resizeInitialMouseX, setResizeInitialMouseX] = useState(0);

  const [openedMore, setOpenedMore] = useState(false);

  function handleResizingPosition({
    e,
    position,
  }: {
    e: React.MouseEvent<HTMLDivElement, MouseEvent>;
    position: "left" | "right";
  }) {
    startResize(e);
    setResizingPosition(position);
  }

  function startResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    setResizing(true);

    setResizeInitialMouseX(event.clientX);
    if (imageRef.current) {
      setResizeInitialWidth(imageRef.current.offsetWidth);
    }
  }

  function resize(event: MouseEvent) {
    if (!resizing) {
      return;
    }

    let dx = event.clientX - resizeInitialMouseX;
    if (resizingPosition === "left") {
      dx = resizeInitialMouseX - event.clientX;
    }

    const newWidth = Math.max(resizeInitialWidth + dx, 150);
    const parentWidth = nodeRef.current?.parentElement?.offsetWidth ?? 0;

    if (newWidth < parentWidth) {
      updateAttributes({
        width: newWidth,
      });
    }
  }

  function endResize() {
    setResizing(false);
    setResizeInitialMouseX(0);
    setResizeInitialWidth(0);
  }

  function handleTouchStart(
    event: React.TouchEvent,
    position: "left" | "right"
  ) {
    event.preventDefault();

    setResizing(true);
    setResizingPosition(position);

    setResizeInitialMouseX(event.touches[0]?.clientX ?? 0);
    if (imageRef.current) {
      setResizeInitialWidth(imageRef.current.offsetWidth);
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (!resizing) {
      return;
    }

    let dx =
      (event.touches[0]?.clientX ?? resizeInitialMouseX) - resizeInitialMouseX;
    if (resizingPosition === "left") {
      dx =
        resizeInitialMouseX -
        (event.touches[0]?.clientX ?? resizeInitialMouseX);
    }

    const newWidth = Math.max(resizeInitialWidth + dx, 150);
    const parentWidth = nodeRef.current?.parentElement?.offsetWidth ?? 0;

    if (newWidth < parentWidth) {
      updateAttributes({
        width: newWidth,
      });
    }
  }

  function handleTouchEnd() {
    setResizing(false);
    setResizeInitialMouseX(0);
    setResizeInitialWidth(0);
  }

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", endResize);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", endResize);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [resizing, resizeInitialMouseX, resizeInitialWidth]);

  return (
    <NodeViewWrapper
      className={cn(
        "relative flex flex-col rounded-md border-2 border-transparent",
        selected ? "border-blue-300" : "",
        node.attrs.align === "left" && "left-0 -translate-x-0",
        node.attrs.align === "center" && "left-1/2 -translate-x-1/2",
        node.attrs.align === "right" && "left-full -translate-x-full"
      )}
      ref={nodeRef}
      style={{ width: node.attrs.width }}
    >
      <div
        className={cn(
          "group relative flex flex-col rounded-md",
          resizing && ""
        )}
      >
        <img
          alt={node.attrs.alt}
          ref={imageRef}
          src={node.attrs.src}
          title={node.attrs.title}
        />
        <NodeViewContent<"figcaption"> as="figcaption" className="text-center">
          {node.attrs.title}
        </NodeViewContent>

        {editor?.isEditable && (
          <>
            <div
              className="absolute inset-y-0 z-20 flex w-[25px] cursor-col-resize items-center justify-start p-2"
              onMouseDown={(event) => {
                handleResizingPosition({ e: event, position: "left" });
              }}
              onTouchStart={(event) => handleTouchStart(event, "left")}
              style={{ left: 0 }}
            >
              <div className="z-20 h-[70px] w-1 rounded-xl border bg-[rgba(0,0,0,0.65)] opacity-0 transition-all group-hover:opacity-100" />
            </div>
            <div
              className="absolute inset-y-0 z-20 flex w-[25px] cursor-col-resize items-center justify-end p-2"
              onMouseDown={(event) => {
                handleResizingPosition({ e: event, position: "right" });
              }}
              onTouchStart={(event) => handleTouchStart(event, "right")}
              style={{ right: 0 }}
            >
              <div className="z-20 h-[70px] w-1 rounded-xl border bg-[rgba(0,0,0,0.65)] opacity-0 transition-all group-hover:opacity-100" />
            </div>
            <div
              className={cn(
                "absolute top-4 right-4 flex items-center gap-1 rounded-md border bg-background p-1 opacity-0 transition-opacity",
                !resizing && "group-hover:opacity-100",
                openedMore && "opacity-100"
              )}
            >
              <Button
                className={cn(
                  "size-7",
                  node.attrs.align === "left" && "bg-accent"
                )}
                onClick={() => {
                  updateAttributes({
                    align: "left",
                  });
                }}
                size="icon"
                variant="ghost"
              >
                <AlignLeft className="size-4" />
              </Button>
              <Button
                className={cn(
                  "size-7",
                  node.attrs.align === "center" && "bg-accent"
                )}
                onClick={() => {
                  updateAttributes({
                    align: "center",
                  });
                }}
                size="icon"
                variant="ghost"
              >
                <AlignCenter className="size-4" />
              </Button>
              <Button
                className={cn(
                  "size-7",
                  node.attrs.align === "right" && "bg-accent"
                )}
                onClick={() => {
                  updateAttributes({
                    align: "right",
                  });
                }}
                size="icon"
                variant="ghost"
              >
                <AlignRight className="size-4" />
              </Button>
              <Separator className="h-[20px]" orientation="vertical" />
              <DropdownMenu
                onOpenChange={(val) => {
                  setOpenedMore(val);
                }}
                open={openedMore}
              >
                <DropdownMenuTrigger
                  render={
                    <Button className="size-7" size="icon" variant="ghost">
                      <MoreVertical className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent
                  align="start"
                  alignOffset={-90}
                  className="mt-1 text-sm"
                >
                  <DropdownMenuItem
                    onClick={() => {
                      duplicateContent(editor);
                    }}
                  >
                    <Copy className="mr-2 size-4" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      updateAttributes({
                        width: "fit-content",
                      });
                    }}
                  >
                    <Maximize className="mr-2 size-4" /> Full Screen
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      deleteNode();
                    }}
                  >
                    <Trash className="mr-2 size-4" /> Delete Image
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
