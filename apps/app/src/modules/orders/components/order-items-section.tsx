"use client";

import { SelectProperty } from "@sparkyidea/dataview/properties";
import { Button } from "@sparkyidea/ui/components/button";
import { ButtonGroup } from "@sparkyidea/ui/components/button-group";
import { ChevronDown } from "lucide-react";
import { useCreateShipment } from "@/modules/shipments/hooks/use-create-shipment";
import { OrderItemsList } from "../data/order-items-list";
import { ORDER_STATUS_OPTIONS } from "../orders-options";
import type { OrderData } from "../types";
import { CreateShipmentDialog } from "./create-shipment-dialog";

export function OrderItemsSection({ order }: { order: OrderData }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-base leading-snug">Order items</h3>
        <SelectProperty
          config={{ options: ORDER_STATUS_OPTIONS }}
          value={order.fulfillmentStatus ?? "unfulfilled"}
        />
      </div>
      <OrderItemsList orderLines={order.orderLines} />
      <div className="flex justify-end">
        <ButtonGroup>
          <Button
            onClick={() => useCreateShipment.getState().onOpen(order.id)}
            size="sm"
          >
            Mark as fulfilled
          </Button>
          <Button size="icon-sm">
            <ChevronDown />
          </Button>
        </ButtonGroup>
      </div>
      <CreateShipmentDialog order={order} />
    </section>
  );
}
