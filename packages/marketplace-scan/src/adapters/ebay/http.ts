/**
 * REST fetch wrapper for eBay's mobile API. Pins the marketplace-wide ambient
 * headers (`User-Agent`, `X-EBAY-C-MARKETPLACE-ID`, locale, etc.) every
 * endpoint shares; caller passes the per-endpoint bits — Accept variant,
 * Authorization, URL, method, body.
 *
 * On non-2xx the wrapper throws a `ScanRequestError` tagged with the caller-
 * supplied endpoint name (e.g. `"ebay.get-listing"`), so failure routing
 * (401 → markDead, 5xx → cooldown) stays uniform across adapter files.
 */
import { ScanRequestError } from "../../errors";

const AMBIENT_HEADERS = {
  "Accept-Language": "en-US",
  "Content-Type": "application/json",
  "User-Agent": "eBayiPhone/6.192.0",
  "X-EBAY-C-CULTURAL-PREF": "Currency=USD,Timezone=America/New_York,Units=US",
  "X-EBAY-C-MARKETPLACE-ID": "EBAY-US",
  "X-EBAY-C-TERRITORY-ID": "US",
} as const;

export interface EbayFetchRequest {
  /** Optional JSON body. Stringified by the wrapper. */
  body?: unknown;
  /** Caller-supplied tag for error reporting, e.g. `"ebay.get-listing"`. */
  endpoint: string;
  /** Per-endpoint headers — Accept variant, Authorization, etc. Merged over the ambient set. */
  headers?: Record<string, string>;
  /** HTTP method. Defaults to GET. */
  method?: "GET" | "POST";
  /** Fully-qualified URL with query string already attached. */
  url: string;
}

export async function ebayFetch<T>(request: EbayFetchRequest): Promise<T> {
  const response = await fetch(request.url, {
    method: request.method ?? "GET",
    headers: { ...AMBIENT_HEADERS, ...request.headers },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
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

  return (await response.json()) as T;
}
