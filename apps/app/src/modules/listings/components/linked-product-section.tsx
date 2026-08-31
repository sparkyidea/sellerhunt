import { Label } from "@sparkyidea/ui/components/label";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import { LinkedProductList } from "../data/linked-product-list";
import { LinkedProductListSkeleton } from "../data/linked-product-list/linked-product-list-skeleton";
import type { ListingData } from "../types";

export function LinkedProductSection({ listing }: { listing: ListingData }) {
  const product = listing.product;

  return (
    <section className="flex flex-col gap-2">
      <Label>Linked product</Label>
      {product ? (
        <LinkedProductList product={product} />
      ) : (
        <p className="text-muted-foreground text-sm">No linked product.</p>
      )}
    </section>
  );
}

export function LinkedProductSectionSkeleton() {
  return (
    <section className="flex flex-col gap-2">
      <Skeleton className="h-5 w-24" />
      <LinkedProductListSkeleton />
    </section>
  );
}
