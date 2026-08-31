/**
 * Single source of truth for which code paths are governed by which domain.
 *
 * Consumed by `check-domain-coverage.ts` (CI gate) and
 * `.claude/hooks/domain-rules.ts` (edit-time reminder), so the two can't
 * drift into disagreeing about what's guarded.
 */

/** Rule-ID prefix each bounded context owns. Prefixes are never reassigned. */
export const DOMAIN_PREFIXES: Record<string, string> = {
  catalog: "CAT",
  channels: "CHN",
  fulfillment: "FUL",
  inventory: "INV",
  listings: "LST",
  orders: "ORD",
  sync: "SYN",
  tenancy: "TEN",
};

export interface Guard {
  domain: string;
  match: RegExp;
  prefix: string;
}

export const GUARDED: Guard[] = [
  {
    match: /^packages\/sync\/src\/orders\/inventory\.ts$/,
    domain: "inventory",
    prefix: "INV",
  },
  {
    match: /^packages\/db\/src\/schema\/(inventory|stock)\.ts$/,
    domain: "inventory",
    prefix: "INV",
  },
  { match: /^packages\/sync\/src\/outbox\//, domain: "sync", prefix: "SYN" },
  {
    match: /^packages\/db\/src\/schema\/sync-outbox\.ts$/,
    domain: "sync",
    prefix: "SYN",
  },
  { match: /^packages\/sync\/src\/listings\//, domain: "sync", prefix: "SYN" },
  {
    match: /^apps\/worker\/src\/processors\/listings\.ts$/,
    domain: "sync",
    prefix: "SYN",
  },
  {
    match: /^packages\/sync\/src\/orders\/(relink|upsert-orders)\.ts$/,
    domain: "orders",
    prefix: "ORD",
  },
  {
    match: /^packages\/sync\/src\/(shipments|tracking)\//,
    domain: "fulfillment",
    prefix: "FUL",
  },
  {
    match: /^packages\/db\/src\/schema\/(shipment|tracking)\.ts$/,
    domain: "fulfillment",
    prefix: "FUL",
  },
  {
    match: /^packages\/marketplace\/src\/adapters\/[^/]+\/auth\/scopes\.ts$/,
    domain: "channels",
    prefix: "CHN",
  },
  // Mappers are where CHN-007 (map by meaning, not by the vendor's noun) bites.
  {
    match: /^packages\/marketplace\/src\/adapters\/[^/]+\/api\/mapper\//,
    domain: "channels",
    prefix: "CHN",
  },
  {
    match: /^packages\/marketplace\/src\/adapters\/[^/]+\/notification\//,
    domain: "channels",
    prefix: "CHN",
  },
  {
    match: /^apps\/api\/src\/lib\/channel-webhook\.ts$/,
    domain: "channels",
    prefix: "CHN",
  },
  {
    match: /^packages\/db\/src\/schema\/(category|marketplace-category)\.ts$/,
    domain: "catalog",
    prefix: "CAT",
  },
  {
    match: /^packages\/db\/src\/schema\/listing\.ts$/,
    domain: "listings",
    prefix: "LST",
  },
  {
    match: /^packages\/trpc\/src\/index\.ts$/,
    domain: "tenancy",
    prefix: "TEN",
  },
];

/** Every guard matching a repo-relative path. A file can be governed by more than one domain. */
export function guardsFor(relativePath: string): Guard[] {
  return GUARDED.filter((g) => g.match.test(relativePath));
}
