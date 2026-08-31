"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { ListView } from "@sparkyidea/dataview/views/list-view";
import type { OrderData } from "../../types";
import { orderItemsListProperties } from "./order-items-list-properties";

export function OrderItemsList({
  orderLines,
}: {
  orderLines: OrderData["orderLines"];
}) {
  return (
    <SimpleDataViewProvider
      className="rounded-lg border p-2"
      data={orderLines}
      properties={orderItemsListProperties}
    >
      <ListView showHorizontalLines />
    </SimpleDataViewProvider>
  );
}
