"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sparkyidea/ui/components/popover";
import { Separator } from "@sparkyidea/ui/components/separator";
import { cn } from "@sparkyidea/ui/lib/utils";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { CategoryNode, CategoryValue } from "./types";

export type UseCategoryChildren = (
  parentId: string | null,
  enabled: boolean
) => { data: CategoryNode[] | undefined; isLoading: boolean };

export type UseCategoryOne = (
  id: string,
  enabled: boolean
) => { data: CategoryNode | null | undefined };

interface CategoryPickerProps {
  disabled?: boolean;
  onChange: (next: CategoryValue | null) => void;
  placeholder?: string;
  useChildren: UseCategoryChildren;
  useOne: UseCategoryOne;
  value: CategoryValue | null;
}

function CategoryList({
  categories,
  isLoading,
  onSelect,
}: {
  categories: CategoryNode[];
  isLoading: boolean;
  onSelect: (cat: CategoryNode) => void;
}) {
  if (isLoading) {
    return (
      <div className="px-3 py-4 text-center text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-muted-foreground text-sm">
        No categories found
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      {categories.map((cat) => (
        <Button
          className="w-full justify-between"
          key={cat.id}
          onClick={() => onSelect(cat)}
          variant="ghost"
        >
          <span>{cat.name}</span>
          {!cat.leaf && (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </Button>
      ))}
    </div>
  );
}

function formatCategoryPath(fullName: string): string {
  const segments = fullName.split(" > ");
  if (segments.length < 2) {
    return fullName;
  }
  return `${segments.at(-1)} in ${segments.at(-2)}`;
}

function CategoryBreadcrumb({ fullName }: { fullName: string }) {
  const segments = fullName.split(" > ");
  if (segments.length <= 2) {
    return <span className="text-muted-foreground text-xs">{fullName}</span>;
  }
  const first = segments[0];
  const last = segments.at(-1);
  return (
    <span className="text-muted-foreground text-xs">
      {first}
      <ChevronRightIcon className="mx-0.5 inline size-3" />
      ...
      <ChevronRightIcon className="mx-0.5 inline size-3" />
      {last}
    </span>
  );
}

function CategoryBackHeader({
  category,
  onBack,
}: {
  category: CategoryNode;
  onBack: () => void;
}) {
  if (category.level < 1) {
    return (
      <Button className="w-full justify-start" onClick={onBack} variant="ghost">
        <ArrowLeftIcon className="size-4" />
        {category.name}
      </Button>
    );
  }

  return (
    <Button
      className="flex h-auto w-full flex-col items-start py-1.5"
      onClick={onBack}
      variant="ghost"
    >
      <div className="flex items-center gap-1">
        <ArrowLeftIcon className="size-3.5 shrink-0" />
        <CategoryBreadcrumb fullName={category.fullName} />
      </div>
      <span className="pl-4.5 font-medium text-sm">{category.name}</span>
    </Button>
  );
}

export function CategoryPicker({
  value,
  onChange,
  disabled,
  placeholder = "Uncategorized",
  useChildren,
  useOne,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);

  const { data: children = [], isLoading } = useChildren(parentId, open);
  const { data: parentCategory } = useOne(parentId ?? "", open && !!parentId);

  const handleSelect = useCallback(
    (cat: CategoryNode) => {
      if (cat.leaf) {
        onChange({ fullName: cat.fullName, id: cat.id });
        setOpen(false);
        setParentId(null);
      } else {
        setParentId(cat.id);
      }
    },
    [onChange]
  );

  const handleBack = useCallback(() => {
    if (parentCategory) {
      setParentId(parentCategory.parentId);
    } else {
      setParentId(null);
    }
  }, [parentCategory]);

  const handleClear = useCallback(() => {
    onChange(null);
    setOpen(false);
    setParentId(null);
  }, [onChange]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setParentId(null);
    }
  }, []);

  const displayValue = value ? formatCategoryPath(value.fullName) : placeholder;

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            className={cn(
              "w-full min-w-0 justify-between",
              !value && "text-muted-foreground"
            )}
            variant="outline"
          />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {displayValue}
        </span>
        {open && value ? (
          <XCircleIcon
            className="size-4 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) gap-1 p-1"
        side="bottom"
        sideOffset={4}
      >
        {parentId && parentCategory && (
          <>
            <CategoryBackHeader category={parentCategory} onBack={handleBack} />
            <Separator />
          </>
        )}
        <CategoryList
          categories={children}
          isLoading={isLoading}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
