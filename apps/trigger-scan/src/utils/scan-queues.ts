/** Bounds executing leaves across marketplaces, not physical box placement. */
export const LISTING_LEAF_CONCURRENCY = 2;
export const LISTING_LEAF_QUEUE = {
  name: "scan-listing-leaf",
  concurrencyLimit: LISTING_LEAF_CONCURRENCY,
} as const;
