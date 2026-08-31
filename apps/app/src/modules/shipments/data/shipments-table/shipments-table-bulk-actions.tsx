import type { BulkAction } from "@sparkyidea/dataview/types";
import { Download } from "lucide-react";
import Papa from "papaparse";
import type { Shipment } from "../../types";

export const shipmentsTableBulkActions: BulkAction<Shipment>[] = [
  {
    label: "Export Tracking",
    icon: <Download className="h-4 w-4" />,
    onClick: (items) => {
      const data = items.map((item) => ({
        "ORDER NUMBER": item.order?.orderNumber ?? item.order?.reference ?? "",
        CARRIER: item.carrier ?? "",
        "TRACKING NUMBER": item.tracking ?? "",
        STATUS: item.trackings?.status?.[0] ?? "",
        "SHIP TO NAME": item.shipToName ?? "",
        "SHIP TO CITY": item.shipToCity ?? "",
        "SHIP TO STATE": item.shipToState ?? "",
        "SHIP TO ZIP": item.shipToZipcode ?? "",
      }));

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shipments-tracking-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
];
