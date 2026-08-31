import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import { OrderItemsListSkeleton } from "../data/order-items-list/order-items-list-skeleton";

export function OrderItemsSectionSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <OrderItemsListSkeleton />
      <div className="flex justify-end">
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>
    </section>
  );
}
