"use client";

import { TableSkeleton, ToolbarSkeleton } from "@sparkyidea/dataview/skeletons";
import { issuesTableProperties } from "./issues-table-properties";

export function IssuesTableSkeleton() {
  return (
    <>
      <ToolbarSkeleton enableSettings tabCount={6} />
      <TableSkeleton
        pagination="page"
        properties={issuesTableProperties}
        rowCount={25}
      />
    </>
  );
}
