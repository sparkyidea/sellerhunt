import type { DataViewProperty } from "@sparkyidea/dataview/types";
import { MarketplaceIcon } from "@/lib/utils/marketplace-icon";
import { ItemsSummary } from "@/modules/shared/items-summary/items-summary";
import {
  ISSUE_STATUS_OPTIONS,
  ISSUE_TYPE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  PAYMENT_OPTIONS,
} from "../../orders-options";
import type { Order } from "../../types";

export const ordersTableProperties = [
  {
    name: "Order",
    type: "formula",
    value: (property, item) => {
      const isRefunded = item.status === "refunded";
      const channel = item.channel;
      const marketplaceId = channel?.marketplace?.id;

      return (
        <div className="flex items-center gap-2 pl-1">
          <MarketplaceIcon
            className="h-6 w-6 shrink-0"
            marketplaceId={marketplaceId}
          />
          <div className="flex flex-col">
            <span
              className={
                isRefunded
                  ? "text-muted-foreground text-sm line-through"
                  : "text-sm"
              }
            >
              {property("reference")}
            </span>
            <span className="text-muted-foreground text-xs">
              {property("orderedAt")}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    name: "Status",
    type: "formula",
    value: (property, item) => {
      const statuses = item.issues?.status ?? [];
      const hasOpenIssue = statuses.includes("open");

      return (
        <div className="flex flex-col gap-1">
          {property("status")}
          {hasOpenIssue && property("issues.type")}
        </div>
      );
    },
  },
  {
    name: "Customer",
    type: "formula",
    value: (property, item) => {
      const isRefunded = item.status === "refunded";
      const location = [item.shippingCity, item.shippingState]
        .filter(Boolean)
        .join(", ");

      return (
        <div
          className={
            isRefunded ? "text-muted-foreground line-through" : undefined
          }
        >
          {property("shippingName")}
          {item.customerUsername && (
            <span className="underline">{item.customerUsername}</span>
          )}
          {location && (
            <div className="text-muted-foreground text-sm">{location}</div>
          )}
        </div>
      );
    },
  },
  {
    name: "Total",
    type: "formula",
    value: (property, item) => {
      const isRefunded = item.status === "refunded";

      return (
        <div className="flex flex-col gap-1">
          <span
            className={
              isRefunded ? "text-muted-foreground line-through" : "font-medium"
            }
          >
            {property("total")}
          </span>
          {property("paid")}
        </div>
      );
    },
  },
  {
    name: "Items",
    type: "formula",
    value: (_property, item) => {
      const ids = item.orderLines?.id ?? [];
      const imageUrls = item.orderLines?.imageUrl ?? [];
      const titles = item.orderLines?.title ?? [];
      const items = ids.map((_, i) => ({
        imageUrl: imageUrls[i] ?? null,
        title: titles[i] ?? "",
      }));
      return <ItemsSummary countBadge={ids.length} items={items} />;
    },
  },
  {
    key: "orderLines.id",
    name: "Total Quantity",
    type: "rollup",
    config: { type: "number", calculation: "count" },
    hidden: true,
    enableSort: false,
    enableGroup: false,
  },
  {
    name: "Actions",
    type: "formula",
    enableGroup: false,
    enableFilter: false,
    enableSearch: false,
    enableSort: false,
    value: (_property, item) => {
      const statuses = item.issues?.status ?? [];
      const types = item.issues?.type ?? [];
      const openIndex = statuses.indexOf("open");
      if (openIndex !== -1) {
        const issueType = types[openIndex];
        const label =
          issueType === "cancellation"
            ? "Cancel Requested"
            : `${issueType} · open`;
        return (
          <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive text-xs">
            {label}
          </span>
        );
      }

      const status = item.status;
      const isShipped =
        status === "fulfilled" ||
        status === "partially_fulfilled" ||
        status === "completed";

      return (
        <span className="text-muted-foreground text-xs">
          {isShipped ? "Shipped" : "Awaiting Label"}
        </span>
      );
    },
  },
  // Hidden backing fields
  {
    key: "total",
    name: "Total Paid",
    type: "number",
    config: { numberFormat: "dollar", decimalPlaces: 2, scale: 100 },
    hidden: true,
  },
  {
    key: "reference",
    name: "Order Number",
    type: "text",
    hidden: true,
  },
  {
    key: "shippingName",
    name: "Customer Name",
    type: "text",
    hidden: true,
  },
  {
    key: "customerUsername",
    name: "Customer Username",
    type: "text",
    hidden: true,
  },
  {
    key: "shippingCity",
    name: "Shipping City",
    type: "text",
    hidden: true,
  },
  {
    key: "shippingState",
    name: "Shipping State",
    type: "text",
    hidden: true,
  },
  {
    key: "orderedAt",
    name: "Order At",
    type: "date",
    config: { dateFormat: "MM/DD/YYYY" },
    hidden: true,
  },
  {
    key: "status",
    name: "Order Status",
    type: "select",
    hidden: true,
    config: {
      options: ORDER_STATUS_OPTIONS,
    },
  },
  {
    key: "issues.type",
    name: "Issue Type",
    type: "rollup",
    hidden: true,
    config: {
      type: "select",
      calculation: "showOriginal",
      options: ISSUE_TYPE_OPTIONS,
    },
  },
  {
    key: "issues.status",
    name: "Issue Status",
    type: "rollup",
    hidden: true,
    config: {
      type: "select",
      calculation: "showOriginal",
      options: ISSUE_STATUS_OPTIONS,
    },
  },
  {
    key: "paid",
    name: "Payment",
    type: "select",
    hidden: true,
    config: {
      options: PAYMENT_OPTIONS,
    },
  },
  {
    key: "shipBy",
    name: "Ship By",
    type: "date",
    hidden: true,
  },
  {
    key: "orderLines.title",
    name: "Product Name",
    type: "rollup",
    config: { type: "text", calculation: "showOriginal" },
    wrap: true,
    hidden: true,
  },
] as DataViewProperty<Order>[];
