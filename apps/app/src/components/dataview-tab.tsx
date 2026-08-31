"use client";

import {
  useFilterParams,
  useGroupParams,
  useSortParams,
} from "@sparkyidea/dataview/hooks";
import type {
  GroupConfigInput,
  SortQuery,
  WhereNode,
} from "@sparkyidea/dataview/types";
import { Label } from "@sparkyidea/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sparkyidea/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@sparkyidea/ui/components/tabs";
import { useState } from "react";

export interface TabOption {
  /** Filter to apply when selected. undefined = no change, null = clear */
  filter?: WhereNode[] | null;
  /** Group config to apply when selected. null = flat (no grouping) */
  group?: GroupConfigInput | null;
  /** Display label for the tab */
  label: string;
  /** Sort to apply when selected. undefined = no change, null = clear */
  sort?: SortQuery[] | null;
}

interface DataViewTabProps {
  /** Additional class name */
  className?: string;
  /** Tab options - first option is the default */
  options: TabOption[];
}

export function DataViewTab({ options, className }: DataViewTabProps) {
  const { setGroup, clearGroup } = useGroupParams();
  const { setFilter, clearFilter } = useFilterParams();
  const { setSort, clearSort } = useSortParams();

  const [selectedValue, setSelectedValue] = useState(
    () => options[0]?.label ?? ""
  );

  const handleValueChange = (label: string | null) => {
    if (!label) {
      return;
    }
    const option = options.find((opt) => opt.label === label);
    if (!option) {
      return;
    }

    setSelectedValue(label);

    if (option.group === null) {
      clearGroup();
    } else if (option.group !== undefined) {
      setGroup(option.group);
    }

    if (option.filter === null) {
      clearFilter();
    } else if (option.filter !== undefined) {
      setFilter(option.filter);
    }

    if (option.sort === null) {
      clearSort();
    } else if (option.sort !== undefined) {
      setSort(option.sort);
    }
  };

  return (
    <Tabs
      className={className}
      onValueChange={handleValueChange}
      value={selectedValue}
    >
      <Label className="sr-only" htmlFor="view-selector">
        View
      </Label>
      <Select onValueChange={handleValueChange} value={selectedValue}>
        <SelectTrigger className="flex w-fit sm:hidden" id="view-selector">
          <SelectValue placeholder="Select a view" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.label} value={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <TabsList className="hidden sm:flex">
        {options.map((option) => (
          <TabsTrigger key={option.label} value={option.label}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
