"use client";

import { Label } from "@sparkyidea/ui/components/label";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import type { ListingRecentSoldOrderLine } from "@/modules/listings/types";
import { RecentOrdersList } from "../data/recent-orders-list";
import { RecentOrdersListSkeleton } from "../data/recent-orders-list/recent-orders-list-skeleton";

export function RecentOrdersSection({
  orderLines,
}: {
  orderLines: ListingRecentSoldOrderLine[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <Label>Recent sold</Label>
      <RecentOrdersList orderLines={orderLines} />
    </section>
  );
}

export function RecentOrdersSectionSkeleton() {
  return (
    <section className="flex flex-col gap-2">
      <Skeleton className="h-5 w-24" />
      <RecentOrdersListSkeleton />
    </section>
  );
}
