import type { TabOption } from "@sparkyidea/dataview/preset-tabs";

/**
 * App tabs for the profile fleet view. Each option owns only the `app` rule,
 * so it composes with the status tabs and any filter the operator adds.
 *
 * `inArray` with a single-element array, not `eq`: `app` is a `select`
 * property, and the filter toolbar encodes select/status rules as arrays. A
 * preset written as `eq` never matches what the toolbar produces, so the tab
 * would not read as active and an operator's edit to the rule would fight it
 * (same encoding as `marketplacePresets` on the listings view).
 */
export const mobileProfileAppPresets: TabOption[] = [
  { label: "All apps", filter: null },
  {
    label: "eBay",
    filter: [{ property: "app", condition: "inArray", value: ["ebay"] }],
  },
  {
    label: "Shopify",
    filter: [{ property: "app", condition: "inArray", value: ["shop"] }],
  },
];

/**
 * Lifecycle tabs over `mobile_profile.status`. Array-encoded for the same
 * reason as the app tabs — `status` is a `status` property, and the filter
 * toolbar encodes those as arrays.
 */
export const mobileProfileStatusPresets: TabOption[] = [
  { label: "All", filter: null },
  {
    label: "Active",
    filter: [{ property: "status", condition: "inArray", value: ["active"] }],
  },
  {
    label: "Dead",
    filter: [{ property: "status", condition: "inArray", value: ["dead"] }],
  },
];
