interface ShopifyGraphQLErrors {
  graphQLErrors?: Array<{
    extensions?: { code?: string };
    message?: string;
    path?: Array<string | number>;
  }>;
  message?: string;
  networkStatusCode?: number;
}

/**
 * Format a Shopify Admin GraphQL error envelope into a single-line message
 * suitable for `throw new Error(...)`. Prefers the most specific signal:
 *
 *   1. The first `graphQLErrors[i]` (with code + path) — surfaces
 *      ACCESS_DENIED, throttling, etc. with the field that triggered it
 *   2. The wrapper `message` (often a generic "An error occurred while
 *      fetching from the API")
 *   3. The fallback string the caller supplies
 *
 * The wrapper-first ordering used elsewhere in this adapter buries
 * actionable per-field errors behind the generic wrapper text — this helper
 * inverts that so `ACCESS_DENIED on order.fulfillmentOrders` is what the
 * user sees, not "Review 'graphQLErrors' for details."
 */
export function formatGraphQLError(
  errors: ShopifyGraphQLErrors | null | undefined,
  fallback: string
): string {
  const first = errors?.graphQLErrors?.[0];
  if (first?.message) {
    const code = first.extensions?.code ? ` [${first.extensions.code}]` : "";
    const path = first.path?.length ? ` at ${first.path.join(".")}` : "";
    return `${first.message}${code}${path}`;
  }
  return errors?.message ?? fallback;
}
