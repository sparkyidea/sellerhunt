import { OrderShipmentsTable } from "../data/order-shipments-table";
import type { OrderData } from "../types";

export function ShipmentsSection({ order }: { order: OrderData }) {
  if (order.shipments.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <OrderShipmentsTable shipments={order.shipments} />
    </section>
  );
}
