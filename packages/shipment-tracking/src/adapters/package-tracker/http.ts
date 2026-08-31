import { PackageTrackerError } from "./errors";

const BASE_URL = "https://api.ship24.com";

/**
 * `User-Agent` captured from the Package Tracker iOS app. The Ship24 mobile
 * endpoint pins responses to this UA shape — sending an arbitrary UA tends
 * to land on a different (rate-limited) tier.
 */
const USER_AGENT =
  "PackageTracker/1.1.1 (com.williamwagner.packagetracker; build:4; iOS 16.3.0) Alamofire/5.10.2";

export interface PackageTrackerRequest {
  body: unknown;
  credential: string;
  path: string;
}

/**
 * Issue a JSON POST against the Ship24 mobile tracking API and parse the
 * response. Throws `PackageTrackerError` on non-2xx.
 *
 * The Bearer token rides in `Authorization`; everything else is pinned UA
 * + content-type so the upstream treats us like the iOS client.
 */
export async function packageTrackerFetch<T>(
  request: PackageTrackerRequest
): Promise<T> {
  const url = `${BASE_URL}${request.path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${request.credential}`,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify(request.body),
  });

  const rawBody = await response.text();

  if (!response.ok) {
    throw new PackageTrackerError({
      httpStatus: response.status,
      upstreamMessage: extractErrorMessage(rawBody) ?? rawBody.slice(0, 500),
      path: request.path,
    });
  }

  return JSON.parse(rawBody) as T;
}

function extractErrorMessage(rawBody: string): string | null {
  if (!rawBody) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "errors" in parsed &&
      Array.isArray((parsed as { errors: unknown }).errors)
    ) {
      const first = (parsed as { errors: Array<{ message?: string }> })
        .errors[0];
      if (first && typeof first.message === "string") {
        return first.message;
      }
    }
  } catch {
    return null;
  }
  return null;
}
