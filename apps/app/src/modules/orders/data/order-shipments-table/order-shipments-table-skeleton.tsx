"use client";

import { TableSkeleton } from "@sparkyidea/dataview/skeletons";
import { orderShipmentsTableProperties } from "./order-shipments-table-properties";

export function OrderShipmentsTableSkeleton() {
  return (
    <TableSkeleton properties={orderShipmentsTableProperties} rowCount={2} />
  );
}
