"use client";

import { ListSkeleton } from "@sparkyidea/dataview/skeletons";
import { orderItemsListProperties } from "./order-items-list-properties";

export function OrderItemsListSkeleton() {
  return (
    <div className="rounded-lg border p-2">
      <ListSkeleton properties={orderItemsListProperties} rowCount={2} />
    </div>
  );
}
