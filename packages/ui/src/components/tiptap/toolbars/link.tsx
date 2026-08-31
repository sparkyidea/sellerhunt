"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Input } from "@sparkyidea/ui/components/input";
import { Label } from "@sparkyidea/ui/components/label";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@sparkyidea/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { getUrlFromString } from "@sparkyidea/ui/lib/tiptap-utils";
import { cn } from "@sparkyidea/ui/lib/utils";
import { Link as LinkIcon, Trash2, X } from "lucide-react";
import type * as React from "react";
import { type FormEvent, useEffect, useState } from "react";
import { useToolbar } from "./toolbar-provider";

type ButtonProps = React.ComponentProps<typeof Button>;

function LinkToolbar({ className, ref, ...props }: ButtonProps) {
  const { editor } = useToolbar();
  const [link, setLink] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const url = getUrlFromString(link);
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  };

  useEffect(() => {
    setLink(editor?.getAttributes("link").href ?? "");
  }, [editor]);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              disabled={!editor?.can().chain().setLink({ href: "" }).run()}
              render={
                <Button
                  className={cn(
                    editor?.isActive("link") && "bg-accent",
                    className
                  )}
                  ref={ref}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  {...props}
                >
                  <LinkIcon className="size-4" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <span>Link</span>
        </TooltipContent>
      </Tooltip>

      <PopoverContent className="relative w-72 px-3 py-2.5">
        <PopoverClose
          render={
            <button
              aria-label="Close"
              className="absolute top-3 right-3"
              type="button"
            >
              <X className="size-4" />
            </button>
          }
        />
        <form onSubmit={handleSubmit}>
          <Label>Link</Label>
          <p className="text-gray-11 text-sm">
            Attach a link to the selected text
          </p>
          <div className="mt-3 flex flex-col items-end justify-end gap-3">
            <Input
              className="w-full"
              onChange={(e) => {
                setLink(e.target.value);
              }}
              placeholder="https://example.com"
              value={link}
            />
            <div className="flex items-center gap-3">
              {editor?.getAttributes("link").href && (
                <Button
                  className="h-8 text-gray-11"
                  onClick={() => {
                    editor?.chain().focus().unsetLink().run();
                    setLink("");
                  }}
                  size="sm"
                  type="reset"
                  variant="ghost"
                >
                  <Trash2 className="mr-2 size-4" />
                  Remove
                </Button>
              )}
              <Button className="h-8" size="sm">
                {editor?.getAttributes("link").href ? "Update" : "Confirm"}
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export { LinkToolbar };
