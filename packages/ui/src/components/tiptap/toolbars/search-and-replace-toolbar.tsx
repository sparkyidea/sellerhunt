"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Checkbox } from "@sparkyidea/ui/components/checkbox";
import { Input } from "@sparkyidea/ui/components/input";
import { Label } from "@sparkyidea/ui/components/label";
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
import { ArrowLeftIcon, ArrowRightIcon, Repeat, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SearchAndReplaceStorage } from "../extensions/search-and-replace";
import { useToolbar } from "./toolbar-provider";

function SearchAndReplaceToolbar() {
  const { editor } = useToolbar();

  const [open, setOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [checked, setChecked] = useState(false);

  const searchStorage = editor?.storage?.searchAndReplace as
    | SearchAndReplaceStorage
    | undefined;
  const results = searchStorage?.results;
  const selectedResult = searchStorage?.selectedResult;

  const replace = () => editor?.chain().replace().run();
  const replaceAll = () => editor?.chain().replaceAll().run();
  const selectNext = () => editor?.chain().selectNextResult().run();
  const selectPrevious = () => editor?.chain().selectPreviousResult().run();

  useEffect(() => {
    editor?.chain().setSearchTerm(searchText).run();
  }, [searchText, editor]);

  useEffect(() => {
    editor?.chain().setReplaceTerm(replaceText).run();
  }, [replaceText, editor]);

  useEffect(() => {
    editor?.chain().setCaseSensitive(checked).run();
  }, [checked, editor]);

  useEffect(() => {
    if (!open) {
      setReplaceText("");
      setSearchText("");
      setReplacing(false);
    }
  }, [open]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              disabled={!editor}
              render={
                <Button
                  className={cn("h-8 w-max px-3 font-normal")}
                  onClick={() => {
                    setOpen(!open);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Repeat className="mr-2 size-4" />
                  <p>Search & Replace</p>
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <span>Search & Replace</span>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        className="relative flex w-[400px] px-3 py-2.5"
      >
        {replacing ? (
          <div className={cn("relative w-full")}>
            <X
              className="absolute top-3 right-3 h-4 w-4 cursor-pointer"
              onClick={() => {
                setOpen(false);
              }}
            />
            <div className="flex w-full items-center gap-3">
              <Button
                className="size-7 rounded-full"
                onClick={() => {
                  setReplacing(false);
                }}
                size="icon"
                variant="ghost"
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <h2 className="font-medium text-sm">Search and replace</h2>
            </div>

            <div className="my-2 w-full">
              <div className="mb-3">
                <Label className="mb-1 text-gray-11 text-xs">Search</Label>
                <Input
                  onChange={(e) => {
                    setSearchText(e.target.value);
                  }}
                  placeholder="Search..."
                  value={searchText}
                />
                {results?.length === 0
                  ? selectedResult
                  : (selectedResult ?? 0) + 1}
                /{results?.length}
              </div>
              <div className="mb-2">
                <Label className="mb-1 text-gray-11 text-xs">
                  Replace with
                </Label>
                <Input
                  className="w-full"
                  onChange={(e) => {
                    setReplaceText(e.target.value);
                  }}
                  placeholder="Replace..."
                  value={replaceText}
                />
              </div>
              <div className="mt-3 flex items-center space-x-2">
                <Checkbox
                  checked={checked}
                  id="match_case"
                  onCheckedChange={(value: boolean) => {
                    setChecked(value);
                  }}
                />
                <Label
                  className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor="match_case"
                >
                  Match case
                </Label>
              </div>
            </div>

            <div className="actions mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  className="size-7"
                  onClick={selectPrevious}
                  size="icon"
                  variant="secondary"
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
                <Button
                  className="size-7"
                  onClick={selectNext}
                  size="icon"
                  variant="secondary"
                >
                  <ArrowRightIcon className="size-4" />
                </Button>
              </div>

              <div className="main-actions flex items-center gap-2">
                <Button
                  className="h-7 px-3 text-xs"
                  onClick={replaceAll}
                  size="sm"
                  variant="secondary"
                >
                  Replace All
                </Button>
                <Button
                  className="h-7 px-3 text-xs"
                  onClick={replace}
                  size="sm"
                >
                  Replace
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className={cn("relative flex items-center gap-1.5")}>
            <Input
              className="w-48"
              onChange={(e) => {
                setSearchText(e.target.value);
              }}
              placeholder="Search..."
              value={searchText}
            />
            <span>
              {results?.length === 0
                ? selectedResult
                : (selectedResult ?? 0) + 1}
              /{results?.length}
            </span>
            <Button
              className="size-7"
              onClick={selectPrevious}
              size="icon"
              variant="ghost"
            >
              <ArrowLeftIcon className="size-4" />
            </Button>
            <Button
              className="size-7"
              onClick={selectNext}
              size="icon"
              variant="ghost"
            >
              <ArrowRightIcon className="size-4" />
            </Button>
            <Separator className="mx-0.5 h-7" orientation="vertical" />
            <Button
              className="size-7"
              onClick={() => {
                setReplacing(true);
              }}
              size="icon"
              variant="ghost"
            >
              <Repeat className="size-4" />
            </Button>
            <Button
              className="size-7"
              onClick={() => {
                setOpen(false);
              }}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { SearchAndReplaceToolbar };
