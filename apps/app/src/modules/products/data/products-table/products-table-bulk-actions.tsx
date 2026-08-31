import type { BulkAction } from "@sparkyidea/dataview/types";
import { Download } from "lucide-react";
import Papa from "papaparse";
import type { ProductRow } from "./products-table-properties";

export const productsTableBulkActions: BulkAction<ProductRow>[] = [
  {
    label: "Export",
    icon: <Download className="h-4 w-4" />,
    onClick: (items) => {
      const data = items.map((item) => ({
        Title: item.title,
        Brand: item.brand ?? "",
        Condition: item.condition,
        Variants: item.productVariants?.id?.length ?? 0,
      }));

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
];
