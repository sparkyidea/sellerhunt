import { Button } from "@sparkyidea/ui/components/button";
import { Label } from "@sparkyidea/ui/components/label";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import Link from "next/link";
import { ListingVariantInventoryTable } from "../data/listing-variant-inventory-table";
import { ListingVariantInventoryTableSkeleton } from "../data/listing-variant-inventory-table/listing-variant-inventory-table-skeleton";

interface StockRecord {
  id: string;
  quantity: number;
  reservedQuantity: number;
  warehouse: {
    id: string;
    address1: string;
    city: string;
    state: string;
  } | null;
}

interface VariantWithStock {
  id: string;
  productId: string;
  stockItems: StockRecord[];
}

export function ListingVariantInventorySection({
  variant,
}: {
  variant: VariantWithStock;
}) {
  return (
    <section className="flex flex-col gap-2">
      <Label>Inventory</Label>
      <ListingVariantInventoryTable variant={variant} />
      <div className="flex justify-center">
        <Button
          nativeButton={false}
          render={
            <Link
              href={`/products/${variant.productId}/variants/${variant.id}/inventory-transactions`}
            />
          }
          variant="ghost"
        >
          View inventory transactions
        </Button>
      </div>
    </section>
  );
}

export function ListingVariantInventorySectionSkeleton() {
  return (
    <section className="flex flex-col gap-2">
      <Skeleton className="h-5 w-20" />
      <ListingVariantInventoryTableSkeleton />
    </section>
  );
}
