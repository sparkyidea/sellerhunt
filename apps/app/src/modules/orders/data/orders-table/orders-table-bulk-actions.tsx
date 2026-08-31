import type { BulkAction } from "@sparkyidea/dataview/types";
import convert from "convert-units";
import { Download } from "lucide-react";
import Papa from "papaparse";
import type { Order } from "../../types";

export const ordersTableBulkActions: BulkAction<Order>[] = [
  {
    label: "Export Shipping",
    icon: <Download className="h-4 w-4" />,
    onClick: (items) => {
      const data = items.map((item) => {
        const weights = item.orderLines?.productVariant ?? [];
        const quantities = item.orderLines?.quantity ?? [];
        let totalWeight = 0;
        for (let i = 0; i < weights.length; i++) {
          const w = weights[i]?.weight ?? 0;
          const qty = quantities[i] ?? 1;
          totalWeight += w * qty;
        }

        return {
          WEIGHT:
            totalWeight > 0
              ? convert(totalWeight).from("mg").to("lb").toFixed(2)
              : "",
          "SENDER NAME": "",
          "SENDER ADDRESS 1": "",
          "SENDER ADDRESS 2": "",
          "SENDER CITY": "",
          "SENDER STATE": "",
          "SENDER ZIP": "",
          "RECEIVER NAME": item.shippingName ?? item.billingName ?? "",
          "RECEIVER ADDRESS 1": item.shippingAddress1 ?? "",
          "RECEIVER ADDRESS 2": item.shippingAddress2 ?? "",
          "RECEIVER CITY": item.shippingCity ?? "",
          "RECEIVER STATE": item.shippingState ?? "",
          "RECEIVER ZIP": item.shippingZipCode ?? "",
        };
      });

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-shipping-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
];
