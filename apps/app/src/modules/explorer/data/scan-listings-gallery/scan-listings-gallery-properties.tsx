import type {
  scanListing,
  scanListingVariant,
  scanSeller,
} from "@dashseller/db/schema";
import type { DataViewProperty } from "@sparkyidea/dataview/types";

type FlattenToArrays<T> = { [K in keyof T]: T[K][] };
type ScanListing = typeof scanListing.$inferSelect & {
  variants: FlattenToArrays<typeof scanListingVariant.$inferSelect>;
  seller: FlattenToArrays<typeof scanSeller.$inferSelect> | null;
};

const formatCents = (value: number, currency: string | null) =>
  (value / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency ?? "USD",
  });

export const scanListingsGalleryProperties = [
  {
    key: "title",
    name: "Title",
    type: "text",
  },
  {
    key: "marketplace",
    name: "Marketplace",
    type: "select",
    config: {
      options: [{ value: "ebay", name: "eBay", color: "blue-subtle" }],
    },
  },
  {
    key: "condition",
    name: "Condition",
    type: "select",
    config: {
      options: [
        { value: "New", name: "New", color: "green-subtle" },
        {
          value: "New/Factory Sealed",
          name: "New / Factory Sealed",
          color: "green-subtle",
        },
        {
          value: "New with tags",
          name: "New with tags",
          color: "green-subtle",
        },
        { value: "Like New", name: "Like New", color: "teal-subtle" },
        {
          value: "Seller Refurbished",
          name: "Seller Refurbished",
          color: "blue-subtle",
        },
        {
          value: "Manufacturer Refurbished",
          name: "Manufacturer Refurbished",
          color: "blue-subtle",
        },
        { value: "Used", name: "Used", color: "yellow-subtle" },
        {
          value: "For parts or not working",
          name: "For parts or not working",
          color: "red-subtle",
        },
      ],
    },
  },
  {
    name: "Price",
    type: "formula",
    value: (_property, item) => {
      const variantPrices = item.variants?.price ?? [];
      const validVariantPrices = variantPrices.filter(
        (p): p is number => typeof p === "number"
      );

      if (validVariantPrices.length > 0) {
        const min = Math.min(...validVariantPrices);
        const max = Math.max(...validVariantPrices);
        const currency = item.currency ?? "USD";
        return (
          <span>
            {min === max
              ? formatCents(min, currency)
              : `${formatCents(min, currency)} – ${formatCents(max, currency)}`}
          </span>
        );
      }

      if (typeof item.price === "number") {
        return <span>{formatCents(item.price, item.currency)}</span>;
      }

      return null;
    },
  },
  {
    name: "Performance",
    type: "formula",
    value: (_property, item) => {
      const sold = item.itemSold ?? 0;
      const recent = item.soldLast24h ?? item.soldLast30Days ?? 0;
      const recentLabel =
        item.soldLast24h == null ? "Sold (30d)" : "Sold (24h)";
      return (
        <div className="flex w-full justify-between">
          <div className="flex flex-col items-center">
            <span className="text-muted-foreground text-xs">Sold</span>
            <span>{sold.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground text-xs">{recentLabel}</span>
            <span>{recent.toLocaleString()}</span>
          </div>
        </div>
      );
    },
  },
  {
    key: "imageUrls",
    name: "Images",
    type: "filesMedia",
    hidden: true,
  },
  {
    key: "url",
    name: "URL",
    type: "text",
    hidden: true,
  },
  {
    key: "price",
    name: "Listing Price",
    type: "text",
    hidden: true,
  },
  {
    key: "currency",
    name: "Currency",
    type: "text",
    hidden: true,
  },
  {
    key: "soldLast24h",
    name: "Sold (24h)",
    type: "number",
    hidden: true,
  },
  {
    key: "soldLast30Days",
    name: "Sold (30d)",
    type: "number",
    hidden: true,
  },
  {
    key: "itemSold",
    name: "Lifetime Sold",
    type: "number",
    hidden: true,
  },
  {
    key: "startedAt",
    name: "Started",
    type: "text",
    hidden: true,
  },
  {
    key: "variants.price",
    name: "Variant Price",
    type: "rollup",
    config: {
      type: "number",
      calculation: "showOriginal",
      numberFormat: "dollar",
      decimalPlaces: 2,
      scale: 100,
    },
    hidden: true,
    enableSort: false,
    enableGroup: false,
  },
] as DataViewProperty<ScanListing>[];
