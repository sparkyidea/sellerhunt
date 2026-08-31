import { Label } from "@sparkyidea/ui/components/label";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import { LinkedListingsList } from "../data/linked-listings-list";
import { LinkedListingsListSkeleton } from "../data/linked-listings-list/linked-listings-list-skeleton";
import type { ProductData } from "../types";

export function LinkedListingsSection({ product }: { product: ProductData }) {
  return (
    <section className="flex flex-col gap-2">
      <Label>Linked listings</Label>
      <LinkedListingsList listings={product.listings} />
    </section>
  );
}

export function LinkedListingsSectionSkeleton() {
  return (
    <section className="flex flex-col gap-2">
      <Skeleton className="h-5 w-28" />
      <LinkedListingsListSkeleton />
    </section>
  );
}
