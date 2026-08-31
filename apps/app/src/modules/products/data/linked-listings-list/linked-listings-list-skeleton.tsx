"use client";

import { ListSkeleton } from "@sparkyidea/dataview/skeletons";
import { linkedListingsListProperties } from "./linked-listings-list-properties";

export function LinkedListingsListSkeleton() {
  return (
    <ListSkeleton properties={linkedListingsListProperties} rowCount={2} />
  );
}
