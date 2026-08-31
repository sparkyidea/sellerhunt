"use client";

import { ListSkeleton } from "@sparkyidea/dataview/skeletons";
import { recentOrdersListProperties } from "./recent-orders-list-properties";

export function RecentOrdersListSkeleton() {
  return <ListSkeleton properties={recentOrdersListProperties} rowCount={3} />;
}
