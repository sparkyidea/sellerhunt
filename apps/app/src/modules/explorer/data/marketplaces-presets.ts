import type { TabOption } from "@sparkyidea/dataview/preset-tabs";

/**
 * Marketplace preset tabs for Explore Listings. Each option carries the
 * `marketplace` filter rule it applies ("All markets" clears it), so the
 * PresetTabs instance owns only the `marketplace` property and composes
 * with the sold-band presets and user-added filter rules.
 */
export const marketplacePresets: TabOption[] = [
  { label: "All markets", filter: null },
  {
    label: "eBay",
    filter: [
      { property: "marketplace", condition: "inArray", value: ["ebay"] },
    ],
  },
  {
    label: "Amazon",
    filter: [
      { property: "marketplace", condition: "inArray", value: ["amazon"] },
    ],
  },
  {
    label: "Etsy",
    filter: [
      { property: "marketplace", condition: "inArray", value: ["etsy"] },
    ],
  },
  {
    label: "Shopify",
    filter: [
      { property: "marketplace", condition: "inArray", value: ["shopify"] },
    ],
  },
];
