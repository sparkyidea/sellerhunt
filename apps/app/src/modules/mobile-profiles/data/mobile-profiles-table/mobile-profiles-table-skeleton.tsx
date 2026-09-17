"use client";

import { TableSkeleton, ToolbarSkeleton } from "@sparkyidea/dataview/skeletons";
import { mobileProfilesTableProperties } from "./mobile-profiles-table-properties";

export function MobileProfilesTableSkeleton() {
  return (
    <>
      <ToolbarSkeleton tabCount={3} />
      <ToolbarSkeleton enableSettings tabCount={5} />
      <TableSkeleton
        pagination="page"
        properties={mobileProfilesTableProperties}
        rowCount={25}
      />
    </>
  );
}
