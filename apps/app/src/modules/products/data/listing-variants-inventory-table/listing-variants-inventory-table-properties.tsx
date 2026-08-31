import { FilesMediaProperty } from "@sparkyidea/dataview/properties";
import type { DataViewProperty } from "@sparkyidea/dataview/types";
import type { ProductData } from "../../types";

export interface ListingVariantsInventoryRow {
  available: number;
  committed: number;
  id: string;
  imageUrl: string;
  onHand: number;
  sku: string | null;
  variantId: string;
  variantLabel: string;
  warehouse: string;
}

export const toListingVariantsInventoryRows = (
  productVariants: ProductData["productVariants"]
): ListingVariantsInventoryRow[] =>
  productVariants.flatMap((variant) => {
    const attributeLabel = variant.attributes
      ? Object.values(variant.attributes).join(", ")
      : null;
    return variant.stockItems.map((stock) => ({
      id: stock.id,
      variantId: variant.id,
      variantLabel: attributeLabel || "Default",
      sku: variant.sku ?? null,
      imageUrl: variant.imageUrls?.[0] ?? "/placeholder.svg",
      warehouse: stock.warehouse?.address1 ?? "Unknown",
      committed: stock.reservedQuantity,
      available: stock.quantity - stock.reservedQuantity,
      onHand: stock.quantity,
    }));
  });

export const listingVariantsInventoryTableProperties = [
  {
    id: "warehouse",
    key: "warehouse",
    name: "Warehouse",
    type: "text",
    hidden: true,
  },
  {
    id: "variant",
    name: "Variant",
    type: "formula",
    size: 320,
    value: (_property, row) => (
      <div className="flex items-center gap-2">
        <FilesMediaProperty value={row.imageUrl} />
        <div className="flex flex-col">
          <span className="line-clamp-2 font-medium text-sm">
            {row.variantLabel}
          </span>
          {row.sku ? (
            <span className="text-muted-foreground text-xs">{row.sku}</span>
          ) : null}
        </div>
      </div>
    ),
  },
  {
    id: "committed",
    key: "committed",
    name: "Committed",
    type: "number",
  },
  {
    id: "available",
    key: "available",
    name: "Available",
    type: "number",
  },
  {
    id: "onHand",
    key: "onHand",
    name: "On hand",
    type: "number",
  },
] as DataViewProperty<ListingVariantsInventoryRow>[];
