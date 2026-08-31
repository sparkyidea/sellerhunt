/**
 * GraphQL fetch wrapper for shop.app's mobile API. Pins the endpoint URL +
 * marketplace-wide ambient headers (`User-Agent`, `x-shop-minis-platform-
 * versions`, feature-flag stubs, fresh `session-id` per request); caller
 * passes per-call Bearer + device-identity headers + the GraphQL operation.
 *
 * Handles top-level GraphQL `errors[]` uniformly — every shop data caller
 * routes `errors[]` as a synthetic 400, so the check lives here instead of
 * being repeated in every adapter file. Operation-level `userErrors` (e.g.
 * `SignInAsGuest.userErrors`) are caller-specific and stay at the call site.
 */
import { ScanRequestError } from "../../errors";

const GRAPHQL_ENDPOINT = "https://server.shop.app/graphql";

const AMBIENT_HEADERS = {
  Accept: "*/*",
  "Accept-Language": "en",
  "Content-Type": "application/json",
  "User-Agent": "Shop/2.250.1-release.289403 ios/16.3",
  "x-feature-overrides": "",
  "x-features": "",
  "x-preview-overrides": "null",
  "x-shop-minis-platform-versions": "0.15.0",
} as const;

export interface ShopGraphqlRequest {
  /** Caller-supplied tag for error reporting, e.g. `"shop.get-listing"`. */
  endpoint: string;
  /** Per-call headers — Bearer + device identity. Merged over the ambient set. */
  headers?: Record<string, string>;
  /** GraphQL operation name (e.g. `"ProductDetailsQuery"`). */
  operationName: string;
  /** GraphQL operation source (verbatim from the iOS-app capture). */
  query: string;
  /** Variables map for the operation. */
  variables: Record<string, unknown>;
}

/**
 * Generic envelope shape any caller can extend with their `data` payload type.
 * The wrapper validates the `errors` field; callers consume `data`.
 */
export interface ShopGraphqlEnvelope<TData> {
  data?: TData;
  errors?: Array<{ message?: string }>;
}

export async function shopGraphqlFetch<
  TEnvelope extends ShopGraphqlEnvelope<unknown>,
>(request: ShopGraphqlRequest): Promise<TEnvelope> {
  const sessionId = crypto.randomUUID();

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      ...AMBIENT_HEADERS,
      "session-id": sessionId,
      ...request.headers,
    },
    body: JSON.stringify({
      operationName: request.operationName,
      variables: request.variables,
      query: request.query,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ScanRequestError({
      endpoint: request.endpoint,
      message: `${request.endpoint} failed (${response.status}): ${errorText.slice(0, 500)}`,
      status: response.status,
      body: errorText.slice(0, 500),
    });
  }

  const envelope = (await response.json()) as TEnvelope;

  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    const message = envelope.errors[0]?.message ?? "shop.app GraphQL error";
    throw new ScanRequestError({
      endpoint: request.endpoint,
      message: `${request.endpoint} GraphQL error: ${message}`,
      status: 400,
      body: JSON.stringify(envelope.errors).slice(0, 500),
    });
  }

  return envelope;
}
