import { FilesMediaProperty } from "@sparkyidea/dataview/properties";
import type { DataViewProperty } from "@sparkyidea/dataview/types";
import { Boxes } from "lucide-react";
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

export const inventoryTableProperties = [
  {
    name: "Product",
    type: "formula",
    size: 320,
    value: (property, item) => {
      const imageUrl = item.imageUrls?.[0];
      const attributeLabel = formatVariantAttributes(item.attributes);

      return (
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <FilesMediaProperty value={imageUrl} />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted">
              <Boxes className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="line-clamp-2 font-medium text-sm">
              {property("product.title")}
            </span>
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
    key: "sku",
    name: "SKU",
    type: "text",
  },
  {
    name: "Unavailable",
    type: "formula",
    enableFilter: false,
    enableSort: false,
    enableGroup: false,
    enableSearch: false,
    value: () => <span>0</span>,
  },
  {
    key: "stockItems.reservedQuantity",
    name: "Committed",
    type: "rollup",
    config: { type: "number", calculation: "sum" },
  },
  {
    name: "Available",
    type: "formula",
    enableFilter: false,
    enableSort: false,
    enableGroup: false,
    enableSearch: false,
    value: (_property, item) => {
      const onHand = sumArray(item.stockItems?.quantity);
      const committed = sumArray(item.stockItems?.reservedQuantity);
      return <span>{onHand - committed}</span>;
    },
  },
  {
    key: "stockItems.quantity",
    name: "On hand",
    type: "rollup",
    config: { type: "number", calculation: "sum" },
  },
  {
    key: "product.title",
    name: "Product name",
    type: "rollup",
    config: { type: "text", calculation: "showOriginal" },
    hidden: true,
    wrap: true,
  },
  {
    key: "attributes",
    name: "Variant attribute",
    type: "text",
    hidden: true,
  },
] as DataViewProperty<InventoryRow>[];
