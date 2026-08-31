import { Label } from "@sparkyidea/ui/components/label";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import type { ListingData } from "@/modules/listings/types";
import { ListingVariantsTable } from "../data/listing-variants-table";
import { ListingVariantsTableSkeleton } from "../data/listing-variants-table/listing-variants-table-skeleton";

export function ListingVariantsSection({ listing }: { listing: ListingData }) {
  return (
    <section className="flex flex-col gap-2">
      <Label>Variations</Label>
      <ListingVariantsTable listing={listing} />
    </section>
  );
}

export function ListingVariantsSectionSkeleton() {
  return (
    <section className="flex flex-col gap-2">
      <Skeleton className="h-5 w-20" />
      <ListingVariantsTableSkeleton />
    </section>
  );
}
