import { FilesMediaProperty } from "@sparkyidea/dataview/properties";
import type { DataViewProperty } from "@sparkyidea/dataview/types";

export interface ListingVariantRow {
  id: string;
  imageUrl: string;
  price: string;
  quantity: number;
  sku: string | null;
  sold: number;
  variantLabel: string;
}

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

export const toListingVariantRow = (variant: {
  id: string;
  imageUrls: string[] | null;
  attributes: Record<string, string> | null;
  sku: string | null;
  price: number;
  quantity: number;
  sold: number;
}): ListingVariantRow => ({
  id: variant.id,
  imageUrl: variant.imageUrls?.[0] ?? "/placeholder.svg",
  variantLabel: variant.attributes
    ? Object.values(variant.attributes).join(", ") || "Default"
    : "Default",
  sku: variant.sku,
  price: formatPrice(variant.price),
  quantity: variant.quantity,
  sold: variant.sold,
});

export const listingVariantsTableProperties = [
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
    id: "price",
    key: "price",
    name: "Price",
    type: "text",
  },
  {
    id: "quantity",
    key: "quantity",
    name: "Available",
    type: "number",
  },
  {
    id: "sold",
    key: "sold",
    name: "Sold",
    type: "number",
  },
] as DataViewProperty<ListingVariantRow>[];
