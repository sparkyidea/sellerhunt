"use client";

import { SimpleDataViewProvider } from "@sparkyidea/dataview/providers";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { OrderData } from "../../types";
import { orderShipmentsTableProperties } from "./order-shipments-table-properties";

export function OrderShipmentsTable({
  shipments,
}: {
  shipments: OrderData["shipments"];
}) {
  const openPreview = useOpenPreview();

  return (
    <SimpleDataViewProvider
      data={shipments}
      properties={orderShipmentsTableProperties}
    >
      <TableView
        onRowClick={(row: { id: string }) => openPreview.shipment(row.id)}
        showVerticalLines={false}
      />
    </SimpleDataViewProvider>
  );
}
