import type { BulkAction } from "@sparkyidea/dataview/types";
import { Download } from "lucide-react";
import Papa from "papaparse";
import type { InventoryRow } from "../../types";

const sumArray = (values: number[] | undefined) =>
  (values ?? []).reduce((acc, value) => acc + value, 0);

const formatVariantAttributes = (
  attributes: Record<string, string> | null | undefined
) => {
  if (!attributes) {
    return "";
  }
  return Object.values(attributes).filter(Boolean).join(" / ");
};

export const inventoryTableBulkActions: BulkAction<InventoryRow>[] = [
  {
    label: "Export",
    icon: <Download className="h-4 w-4" />,
    onClick: (items) => {
      const data = items.map((item) => {
        const onHand = sumArray(item.stockItems?.quantity);
        const committed = sumArray(item.stockItems?.reservedQuantity);
        return {
          Product: item.product?.title?.[0] ?? "",
          Variant: formatVariantAttributes(item.attributes),
          SKU: item.sku ?? "",
          Unavailable: 0,
          Committed: committed,
          Available: onHand - committed,
          "On hand": onHand,
        };
      });

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
];
