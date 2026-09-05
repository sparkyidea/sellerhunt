import type {
  scanListing,
  scanListingVariant,
  scanSeller,
} from "@dashseller/db/schema";
import type { DataViewProperty } from "@sparkyidea/dataview/types";
import { Icons, type IconType } from "@sparkyidea/ui/icons";

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

const MARKETPLACES: Record<string, { icon?: IconType; label: string }> = {
  ebay: { icon: Icons.ebay.color, label: "eBay" },
  shop: { icon: Icons.shopify.color, label: "Shopify" },
};

const marketplaceInfo = (marketplace: string) =>
  MARKETPLACES[marketplace] ?? { label: marketplace };

const formatPriceRange = (item: ScanListing): string | null => {
  const variantPrices = (item.variants?.price ?? []).filter(
    (p): p is number => typeof p === "number"
  );
  const currency = item.currency ?? "USD";

  if (variantPrices.length > 0) {
    const min = Math.min(...variantPrices);
    const max = Math.max(...variantPrices);
    return min === max
      ? formatCents(min, currency)
      : `${formatCents(min, currency)} – ${formatCents(max, currency)}`;
  }

  if (typeof item.price === "number") {
    return formatCents(item.price, currency);
  }

  return null;
};

/**
 * Card layout ("version G" of the Explore Listings design):
 *
 *   media  — square, marketplace avatar top-left
 *   body   — price (large) · title · labelled stats
 *
 * Stats are plain properties with `showName`; the card skips empty values, so
 * a listing shows whichever sold counts it has (eBay: 24h, Shopify: 30d) plus
 * the lifetime total.
 */
export const scanListingsGalleryProperties = [
  {
    name: "Price",
    type: "formula",
    value: (_property, item) => {
      const price = formatPriceRange(item);
      if (price == null) {
        return null;
      }
      return (
        <span className="font-semibold text-base tabular-nums leading-tight">
          {price}
        </span>
      );
    },
  },
  {
    key: "title",
    name: "Title",
    type: "text",
  },
  {
    key: "itemSold",
    name: "Lifetime sold",
    type: "number",
    config: { numberFormat: "numberWithCommas" },
    showName: { layout: "horizontal" },
  },
  {
    key: "soldLast24h",
    name: "Sold (24h)",
    type: "number",
    config: { numberFormat: "numberWithCommas" },
    showName: { layout: "horizontal" },
  },
  {
    key: "soldLast30Days",
    name: "Sold (30d)",
    type: "number",
    config: { numberFormat: "numberWithCommas" },
    showName: { layout: "horizontal" },
  },
  {
    // Formula (not a rollup): the count is only meaningful above one, and a
    // rollup cannot hide 0/1.
    name: "Variants",
    type: "formula",
    showName: { layout: "horizontal" },
    value: (_property, item) => {
      const count = item.variants?.id?.length ?? 0;
      return count > 1 ? <span className="text-sm">{count}</span> : null;
    },
  },
  {
    key: "seller.displayName",
    name: "Seller",
    type: "rollup",
    config: { type: "text", calculation: "showOriginal" },
    showName: { layout: "horizontal", align: "end" },
    enableSort: false,
    enableGroup: false,
  },
  {
    // Data-backed twin of the badge below: formulas are excluded from the
    // filter/sort/group/search pickers, so this keeps Marketplace queryable.
    key: "marketplace",
    name: "Marketplace",
    type: "select",
    config: {
      options: [
        { value: "ebay", name: "eBay", color: "blue-subtle" },
        { value: "shop", name: "Shopify", color: "green-subtle" },
      ],
    },
    hidden: true,
  },
  {
    name: "Marketplace badge",
    type: "formula",
    pin: { position: "top-left" },
    hidden: true,
    value: (_property, item) => {
      const { icon: Icon, label } = marketplaceInfo(item.marketplace);
      return (
        <span
          className="inline-flex size-6 items-center justify-center overflow-hidden rounded-full bg-white p-0.75 text-neutral-600"
          title={label}
        >
          {Icon ? (
            <Icon className="size-full" />
          ) : (
            label.charAt(0).toUpperCase()
          )}
        </span>
      );
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
    hidden: true,
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
