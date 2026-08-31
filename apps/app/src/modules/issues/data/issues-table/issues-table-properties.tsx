import type { issue, order } from "@dashseller/db/schema";
import type { DataViewProperty } from "@sparkyidea/dataview/types";
import {
  ISSUE_RESOLUTION_OPTIONS,
  ISSUE_STATUS_OPTIONS,
  ISSUE_TYPE_OPTIONS,
} from "../../issues-options";

type Order = typeof order.$inferSelect;
export type Issue = typeof issue.$inferSelect & {
  order: Order | null;
};

export const issuesTableProperties = [
  {
    name: "Issue",
    type: "formula",
    value: (property, item) => {
      const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);

      return (
        <div className="flex flex-col gap-0.5 pl-1">
          <span className="text-sm">{typeLabel}</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {property("reference") || item.order?.orderNumber || "—"}
            </span>
            {property("status")}
          </div>
        </div>
      );
    },
  },
  {
    name: "Order",
    type: "formula",
    value: (_property, item) => {
      const orderNumber = item.order?.orderNumber ?? item.order?.reference;
      if (!orderNumber) {
        return <span className="text-muted-foreground text-sm">—</span>;
      }
      return <span className="text-sm">{orderNumber}</span>;
    },
  },
  {
    name: "Reason",
    type: "formula",
    value: (_property, item) => {
      if (!item.reason) {
        return <span className="text-muted-foreground text-sm">—</span>;
      }
      return <span className="line-clamp-2 text-sm">{item.reason}</span>;
    },
  },
  {
    name: "Resolution",
    type: "formula",
    value: (property) => {
      return (
        property("resolution") ?? (
          <span className="text-muted-foreground text-sm">—</span>
        )
      );
    },
  },
  {
    name: "Opened",
    type: "formula",
    value: (property) => {
      return (
        <span className="text-muted-foreground text-sm">
          {property("openedAt")}
        </span>
      );
    },
  },
  // Hidden backing fields
  {
    key: "type",
    name: "Type",
    type: "select",
    hidden: true,
    config: { options: ISSUE_TYPE_OPTIONS },
  },
  {
    key: "status",
    name: "Status",
    type: "select",
    hidden: true,
    config: { options: ISSUE_STATUS_OPTIONS },
  },
  {
    key: "resolution",
    name: "Resolution",
    type: "select",
    hidden: true,
    config: { options: ISSUE_RESOLUTION_OPTIONS },
  },
  {
    key: "reference",
    name: "Reference",
    type: "text",
    hidden: true,
  },
  {
    key: "reason",
    name: "Reason",
    type: "text",
    hidden: true,
  },
  {
    key: "openedAt",
    name: "Opened At",
    type: "date",
    hidden: true,
  },
  {
    key: "resolvedAt",
    name: "Resolved At",
    type: "date",
    hidden: true,
  },
  {
    key: "refundAmount",
    name: "Refund Amount",
    type: "number",
    config: { numberFormat: "dollar", decimalPlaces: 2, scale: 100 },
    hidden: true,
  },
  {
    key: "order",
    hidden: true,
    enableGroup: false,
    enableFilter: false,
    enableSearch: false,
    enableSort: false,
  },
] as DataViewProperty<Issue>[];
