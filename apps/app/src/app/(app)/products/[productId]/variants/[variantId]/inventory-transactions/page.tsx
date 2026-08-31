"use client";
import { H3 } from "@sparkyidea/ui/components/typography";
import dynamic from "next/dynamic";
import { use } from "react";
import { InventoryTransactionsTableSkeleton } from "@/modules/inventory/data/inventory-transactions-table/inventory-transactions-table-skeleton";

const InventoryTransactionsTable = dynamic(
  () =>
    import("@/modules/inventory/data/inventory-transactions-table").then(
      (mod) => mod.InventoryTransactionsTable
    ),
  {
    ssr: false,
    loading: () => <InventoryTransactionsTableSkeleton />,
  }
);

export default function VariantInventoryTransactionsPage({
  params,
}: {
  params: Promise<{ productId: string; variantId: string }>;
}) {
  const { variantId } = use(params);

  return (
    <div className="flex flex-col gap-2 pt-4">
      <H3>Inventory transactions</H3>
      <InventoryTransactionsTable productVariantId={variantId} />
    </div>
  );
}
