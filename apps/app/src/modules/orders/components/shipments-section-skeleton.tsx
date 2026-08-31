import { OrderShipmentsTableSkeleton } from "../data/order-shipments-table/order-shipments-table-skeleton";

export function ShipmentsSectionSkeleton() {
  return (
    <section className="flex flex-col gap-2">
      <OrderShipmentsTableSkeleton />
    </section>
  );
}
