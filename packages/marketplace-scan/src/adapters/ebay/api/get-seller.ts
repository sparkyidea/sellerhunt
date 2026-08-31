/**
 * Seller username → seller storefront record (feedback, items sold, followers,
 * etc.) via eBay's mobile-app storefront endpoint
 * (`apisd.ebay.com/experience/storefront/v1/store_results`).
 *
 * Same caveats as `searchListings`: not the public Browse API, JSON shape
 * can change without notice, bearer-token auth is unofficial.
 */
import { ebayFetch } from "../http";
import type {
  EbayStorefrontResponse,
  SectionModule,
} from "../raw-types/storefront-response";

const STOREFRONT_ENDPOINT =
  "https://apisd.ebay.com/experience/storefront/v1/store_results";

const SUPPORTED_UX_COMPONENTS = [
  "ABOUT_DESCRIPTION_V3",
  "ABOUT_STORE_POLICIES",
  "ABOUT_VIDEO",
  "BUSINESS_DETAILS_V2",
  "CHARITY_V2",
  "CHARITY_SETUP",
  "CONTACT_SELLER",
  "FEEDBACK_DETAILED_SELLER_RATING_SUMMARY",
  "FEEDBACK_OVERALL_RATING_SUMMARY",
  "FEEDBACK_DETAIL_LIST_V2",
  "FLOATING_ACTION_BUTTON",
  "ITEMS_CAROUSEL_3D",
  "ITEM_RECOMMENDATIONS",
  "MARKETING_BANNER_3D",
  "MARKETING_BANNER_CAROUSEL",
  "MARKETING_BANNER_V2",
  "MESSAGE_MODULE_V1",
  "NAVIGATION_CAROUSEL_V2",
  "NAVIGATION_PILLS",
  "PRESENCE_INFORMATION",
  "SEARCH_STORE_V3",
  "SEEK_SURVEY",
  "SHARE",
  "SHARE_V2",
  "SORT_ITEMS_SELECTION",
  "STATUS_MESSAGE",
  "STATUS_MESSAGE_INLINE",
  "STORE_TABS",
  "TOP_RATED_SELLER_V2",
  "PROMOTIONS_CAROUSEL",
  "SELLER_ALL_OFFERS",
  "SEARCH_ALL_OFFERS",
  "SELLER_SINGLE_OFFER",
  "SEARCH_SINGLE_OFFER",
  "PRESENCE_INFORMATION_V4",
  "ITEMS_GRID_V4",
  "ITEMS_CAROUSEL_V4",
  "STORE_ANNOUNCEMENTS",
].join(",");

export interface GetSellerOptions {
  /** Bearer token for the eBay mobile API. */
  authToken: string;
  /** eBay seller username, e.g. "sarahabez". */
  sellerId: string;
}

export interface GetSellerResult {
  /** Raw response body. Shape is sample-derived — see `types/storefront-response.ts`. */
  raw: EbayStorefrontResponse;
  /** Parsed seller — fields populated based on what the response actually exposes. */
  seller: Seller;
  /** Echoed for convenience. */
  sellerId: string;
}

export interface Seller {
  /** % positive feedback, normalized to 0..1 (e.g. 100% → 1.0, 99.4% → 0.994). */
  feedbackPercent: number | null;
  /** Lifetime feedback count (e.g. 1861). */
  feedbackScore: number | null;
  /** Follower count, expanded from K/M suffix (e.g. "2.1K" → 2100). */
  followers: number | null;
  /** Seller country, e.g. "United States". */
  location: string | null;
  /** Profile/store logo URL (i.ebayimg.com). */
  logoUrl: string | null;
  /**
   * Seller join date as ISO-8601 (YYYY-MM-DD). Null if eBay returned a format
   * we couldn't parse — store the raw string in `memberSinceRaw` either way.
   */
  memberSince: string | null;
  /** Raw member-since string from eBay (e.g. "Jan 17, 2012"). */
  memberSinceRaw: string | null;
  /** Display name (often equal to seller username, may differ for stores). */
  storeName: string | null;
  /**
   * Lifetime items sold, expanded from K/M suffix (e.g. "4.8K" → 4800). eBay
   * shows this rounded; for an exact figure no public path exists.
   */
  totalItemsSold: number | null;
}

/**
 * Direct layer — build the storefront request and return the raw response body.
 * No parsing. Sandbox `direct-api/` scripts call this for shape discovery.
 */
export function fetchSellerStorefront(
  options: GetSellerOptions
): Promise<EbayStorefrontResponse> {
  const url = new URL(STOREFRONT_ENDPOINT);
  url.searchParams.set("username", options.sellerId);
  url.searchParams.set("supportedUxComponents", SUPPORTED_UX_COMPONENTS);

  return ebayFetch<EbayStorefrontResponse>({
    endpoint: "ebay.get-seller",
    url: url.toString(),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${options.authToken}`,
    },
  });
}

/** Adapter layer — fetch the raw storefront response, then parse the seller. */
export async function getSeller(
  options: GetSellerOptions
): Promise<GetSellerResult> {
  const raw = await fetchSellerStorefront(options);
  const seller = parseSeller(raw);

  return {
    sellerId: options.sellerId,
    seller,
    raw,
  };
}

/**
 * Pull the seller record out of the storefront response.
 *
 * Sources (verified against `sarahabez`):
 *   - PRESENCE_INFORMATION_MODULE: feedbackDescription ("100% positive feedback (1861)"),
 *     soldDescription ("4.8K items sold"), followerDescription ("2.1K followers"),
 *     displayName, logo
 *   - ABOUT_DESCRIPTION_MODULE: sections with "Location" and "Member since"
 *
 * Not in this endpoint's response (would need separate requests):
 *   - totalListings — only available via the seller's search results
 *   - topRatedSeller — TOP_RATED_SELLER_V2 module is omitted unless the seller is
 *     top-rated; absent here means "not confirmed", not "definitely false"
 */
function parseSeller(raw: EbayStorefrontResponse): Seller {
  const presence = raw.modules?.PRESENCE_INFORMATION_MODULE;
  const about = raw.modules?.ABOUT_DESCRIPTION_MODULE;

  const feedbackText = joinSpans(presence?.feedbackDescription?.textSpans);
  const soldText = joinSpans(presence?.soldDescription?.textSpans);
  const followerText = joinSpans(presence?.followerDescription?.textSpans);
  const memberSinceRaw = extractAboutSection(about, "Member since");

  return {
    feedbackPercent: parseFeedbackPercent(feedbackText),
    feedbackScore: parseFeedbackScore(feedbackText),
    followers: parseAbbreviatedNumber(extractLeadingToken(followerText)),
    location: extractAboutSection(about, "Location"),
    logoUrl: presence?.logo?.URL ?? null,
    memberSince: parseMemberSinceIso(memberSinceRaw),
    memberSinceRaw,
    storeName:
      joinSpans(presence?.displayName?.textSpans) ||
      presence?.ownerUsername ||
      null,
    totalItemsSold: parseAbbreviatedNumber(extractLeadingToken(soldText)),
  };
}

/** Lowest-common shape of every `textSpans` array we read from the response. */
type TextSpanLike = ReadonlyArray<{ text: string }>;

function joinSpans(spans: TextSpanLike | undefined): string {
  if (!spans) {
    return "";
  }
  return spans.map((span) => span.text ?? "").join("");
}

function extractLeadingToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const [first] = trimmed.split(WHITESPACE_RE, 1);
  return first ?? null;
}

const PERCENT_RE = /(\d+(?:\.\d+)?)%/;
const PARENS_NUMBER_RE = /\(([\d,]+)\)/;
const ABBREVIATED_NUMBER_RE = /^(\d+(?:\.\d+)?)([KkMm])?$/;
const WHITESPACE_RE = /\s+/;
const TRAILING_COLON_RE = /:$/;

function parseFeedbackPercent(text: string): number | null {
  const match = PERCENT_RE.exec(text);
  if (!match?.[1]) {
    return null;
  }
  const pct = Number.parseFloat(match[1]);
  return Number.isFinite(pct) ? pct / 100 : null;
}

function parseFeedbackScore(text: string): number | null {
  const match = PARENS_NUMBER_RE.exec(text);
  if (!match?.[1]) {
    return null;
  }
  const n = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Expand eBay's abbreviated counts ("4.8K" → 4800, "2.1M" → 2_100_000, "1861" → 1861).
 * Returns null if the input doesn't match the expected shape.
 */
function parseAbbreviatedNumber(token: string | null): number | null {
  if (!token) {
    return null;
  }
  const cleaned = token.replace(/,/g, "");
  const match = ABBREVIATED_NUMBER_RE.exec(cleaned);
  if (!match?.[1]) {
    return null;
  }
  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) {
    return null;
  }
  const suffix = match[2]?.toUpperCase();
  if (suffix === "K") {
    return Math.round(base * 1000);
  }
  if (suffix === "M") {
    return Math.round(base * 1_000_000);
  }
  return Math.round(base);
}

function extractAboutSection(
  about: SectionModule | undefined,
  label: string
): string | null {
  if (!about?.sections) {
    return null;
  }
  for (const section of about.sections) {
    const spans = section.title?.textSpans ?? [];
    if (spans.length < 2) {
      continue;
    }
    const labelText = spans[0]?.text?.trim().replace(TRAILING_COLON_RE, "");
    if (labelText !== label) {
      continue;
    }
    return spans
      .slice(1)
      .map((s) => s.text ?? "")
      .join("")
      .trim();
  }
  return null;
}

const MEMBER_SINCE_RE = /^([A-Za-z]+)\s+(\d+),\s+(\d{4})$/;
const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function parseMemberSinceIso(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const match = MEMBER_SINCE_RE.exec(raw);
  if (!match) {
    return null;
  }
  const [, monthName, day, year] = match;
  const month = monthName ? MONTHS[monthName.slice(0, 3).toLowerCase()] : null;
  if (!(month && day && year)) {
    return null;
  }
  return `${year}-${month}-${day.padStart(2, "0")}`;
}
