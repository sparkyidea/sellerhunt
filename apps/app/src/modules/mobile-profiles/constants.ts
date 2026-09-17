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

/** Route params are strings; the id is an integer. NaN falls through to NOT_FOUND. */
export function parseProfileId(raw: string): number {
  return Number.parseInt(raw, 10);
}

export const STATUS_LABELS = {
  active: "Active",
  dead: "Dead",
} as const;

/** Single source for every form hint about what the worker assignment means. */
export const ASSIGNED_WORKER_HELP =
  "A scan box uses the profile whose assigned worker equals its hostname exactly. A box with no profile claims the lowest-numbered unassigned one on its next run.";
