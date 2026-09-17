import type { TabOption } from "@sparkyidea/dataview/preset-tabs";

/**
 * App tabs for the token fleet view. Each option owns only the `app` rule, so
 * it composes with the bearer-state tabs and any filter the operator adds.
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
 * Bearer-state tabs. `bearerState` is derived server-side from the token-cache
 * columns (see `packages/trpc/src/lib/bearer-state.ts`); the router translates
 * these rules into SQL against the database clock. Array-encoded for the same
 * reason as the app tabs — `bearerState` is a `status` property.
 */
export const mobileProfileStatePresets: TabOption[] = [
  { label: "All", filter: null },
  {
    label: "Valid",
    filter: [
      { property: "bearerState", condition: "inArray", value: ["valid"] },
    ],
  },
  {
    label: "Expiring",
    filter: [
      { property: "bearerState", condition: "inArray", value: ["expiring"] },
    ],
  },
  {
    label: "Expired",
    filter: [
      { property: "bearerState", condition: "inArray", value: ["expired"] },
    ],
  },
  {
    label: "No bearer",
    filter: [
      { property: "bearerState", condition: "inArray", value: ["none"] },
    ],
  },
];
