"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WhereExpression,
  WhereNode,
  WhereRule,
} from "../types/filter.type";
import { analyzeFilter } from "../utils/filter-builder";

export interface UseToolbarStateOptions {
  filter: WhereNode[] | null;
  sorts: unknown[];
}

export interface UseToolbarStateReturn {
  /** Advanced filter (WhereExpression at root, displayed as AdvancedFilterChip) */
  advancedFilter: WhereExpression | null;
  /** Index of advancedFilter in root array */
  advancedFilterIndex: number | null;
  /** Whether any filters or sorts are active */
  hasActiveControls: boolean;
  /** Whether filter needs normalization */
  needsNormalization: boolean;
  /** Whether Row 2 is visible */
  row2Visible: boolean;
  /** Total number of rules in advanced filter */
  ruleCount: number;
  /** Set Row 2 visibility */
  setRow2Visible: (visible: boolean) => void;
  /** Simple filter conditions at root level (displayed as SimpleFilterChip) */
  simpleFilterConditions: Array<{ condition: WhereRule; index: number }>;
  /** Toggle Row 2 visibility */
  toggleRow2: () => void;
}

/**
 * Hook to manage NotionToolbar state logic.
 * Handles Row 2 visibility, filter analysis, and derived state.
 *
 * Filter structure:
 * - Root level is WhereNode[] (implicit AND)
 * - Simple filters (chips) = WhereRule items at root
 * - Advanced filter = WhereExpression item at root (first one found)
 * - Both can coexist, combined with AND logic
 */
export function useToolbarState({
  filter,
  sorts,
}: UseToolbarStateOptions): UseToolbarStateReturn {
  const [row2Visible, setRow2Visible] = useState(false);

  // Analyze filter structure using shared utility
  const filterAnalysis = useMemo(() => analyzeFilter(filter), [filter]);

  // Derived state - empty arrays are considered "no filter/sort"
  const hasActiveControls =
    (filter !== null && filter.length > 0) || sorts.length > 0;

  // Auto-expand Row 2 when a filter or sort is added
  const controlCount = (filter?.length ?? 0) + sorts.length;
  const prevControlCount = useRef(controlCount);
  useEffect(() => {
    if (controlCount > prevControlCount.current) {
      setRow2Visible(true);
    }
    prevControlCount.current = controlCount;
  }, [controlCount]);

  const toggleRow2 = useCallback(() => {
    setRow2Visible((prev) => !prev);
  }, []);

  return {
    hasActiveControls,
    row2Visible,
    setRow2Visible,
    toggleRow2,
    simpleFilterConditions: filterAnalysis.simpleConditions,
    advancedFilter: filterAnalysis.advancedFilter,
    advancedFilterIndex: filterAnalysis.advancedFilterIndex,
    ruleCount: filterAnalysis.ruleCount,
    needsNormalization: filterAnalysis.needsNormalization,
  };
}
