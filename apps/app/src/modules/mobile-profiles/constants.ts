/** Display names for `mobile_profile.app` values; unknown apps fall back to the raw value. */
const APP_LABELS: Record<string, string> = {
  ebay: "eBay",
  shop: "Shopify",
};

export function appLabel(app: string): string {
  return APP_LABELS[app] ?? app;
}

/** How a profile is named everywhere: its database-assigned id, "#12". */
export function profileNumber(id: number): string {
  return `#${id}`;
}

/** The whole segment, as a positive integer — `parseInt` would read "12foo" as 12. */
const PROFILE_ID = /^[1-9]\d*$/;

/** Route params are strings; the id is an integer. Anything else is NaN, which the page turns into a 404. */
export function parseProfileId(raw: string): number {
  return PROFILE_ID.test(raw) ? Number(raw) : Number.NaN;
}

export const STATUS_LABELS = {
  active: "Active",
  dead: "Dead",
} as const;
