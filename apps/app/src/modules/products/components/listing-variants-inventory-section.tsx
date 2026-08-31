import { Label } from "@sparkyidea/ui/components/label";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import { ListingVariantsInventoryTable } from "../data/listing-variants-inventory-table";
import { ListingVariantsInventoryTableSkeleton } from "../data/listing-variants-inventory-table/listing-variants-inventory-table-skeleton";
import type { ProductData } from "../types";

export function ListingVariantsInventorySection({
  product,
}: {
  product: ProductData;
}) {
  return (
    <section className="flex flex-col gap-2">
      <Label>Inventory</Label>
      <ListingVariantsInventoryTable product={product} />
    </section>
  );
}

export function ListingVariantsInventorySectionSkeleton() {
  return (
    <section className="flex flex-col gap-2">
      <Skeleton className="h-5 w-20" />
      <ListingVariantsInventoryTableSkeleton />
    </section>
  );
}
