import type {
  product,
  productVariant,
  stock,
  stockTransaction,
  warehouse,
} from "@dashseller/db/schema";
import { FilesMediaProperty } from "@sparkyidea/dataview/properties";
import type { DataViewProperty } from "@sparkyidea/dataview/types";

type Product = typeof product.$inferSelect;
type Warehouse = typeof warehouse.$inferSelect;
type ProductVariant = typeof productVariant.$inferSelect & {
  product: Product | null;
};
type Stock = typeof stock.$inferSelect & {
  productVariant: ProductVariant | null;
  warehouse: Warehouse | null;
};

export type InventoryTransactionRow = typeof stockTransaction.$inferSelect & {
  stock: Stock | null;
};

const TRANSACTION_TYPE_OPTIONS = [
  { value: "receive", name: "Receive", color: "green-subtle" },
  { value: "reserve", name: "Reserve", color: "yellow-subtle" },
  { value: "fulfill", name: "Fulfill", color: "blue-subtle" },
  { value: "release", name: "Release", color: "gray-subtle" },
  { value: "adjust", name: "Adjust", color: "purple-subtle" },
  { value: "return", name: "Return", color: "teal-subtle" },
];

const formatVariantAttributes = (
  attributes: Record<string, string> | null | undefined
) => {
  if (!attributes) {
    return "";
  }
  return Object.values(attributes).filter(Boolean).join(" / ");
};

export const inventoryTransactionsTableProperties = [
  {
    key: "createdAt",
    name: "Date",
    type: "date",
    config: { dateFormat: "MM/DD/YYYY" },
  },
  {
    key: "type",
    name: "Type",
    type: "select",
    config: { options: TRANSACTION_TYPE_OPTIONS },
  },
  {
    name: "Product",
    type: "formula",
    size: 320,
    value: (_property, item) => {
      const variant = item.stock?.productVariant ?? null;
      const title = variant?.product?.title ?? "Untitled";
      const attributeLabel = formatVariantAttributes(variant?.attributes);

      return (
        <div className="flex items-center gap-2">
          <FilesMediaProperty
            value={variant?.imageUrls?.[0] ?? "/placeholder.svg"}
          />
          <div className="flex flex-col">
            <span className="line-clamp-2 font-medium text-sm">{title}</span>
            {attributeLabel ? (
              <span className="text-muted-foreground text-xs">
                {attributeLabel}
              </span>
            ) : null}
          </div>
        </div>
      );
    },
  },
  {
    name: "SKU",
    type: "formula",
    enableFilter: false,
    enableSort: false,
    enableGroup: false,
    enableSearch: false,
    value: (_property, item) => (
      <span>{item.stock?.productVariant?.sku ?? "—"}</span>
    ),
  },
  {
    name: "Warehouse",
    type: "formula",
    enableFilter: false,
    enableSort: false,
    enableGroup: false,
    enableSearch: false,
    value: (_property, item) => (
      <span>{item.stock?.warehouse?.address1 ?? "—"}</span>
    ),
  },
  {
    key: "quantity",
    name: "Quantity",
    type: "number",
  },
  {
    key: "note",
    name: "Note",
    type: "text",
    wrap: true,
  },
] as DataViewProperty<InventoryTransactionRow>[];
