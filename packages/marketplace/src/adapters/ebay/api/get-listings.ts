import type eBayApi from "ebay-api";
import type { GetListingsOptions, Listing, PageResult } from "../../../types";
import { mapListing } from "./mapper/map-listing";

const ENTRIES_PER_PAGE = 200;
// eBay's GetSellerEvents accepts a max ModTime range of 48h; clamp to 47h
// so we don't ride the boundary and trip "Time range exceeds maximum".
const SELLER_EVENTS_MAX_RANGE_MS = 47 * 60 * 60 * 1000;
// GetSellerEvents has no pagination and silently truncates large responses.
// When we approach this threshold, treat the window as saturated and bisect.
// Conservative — well below eBay's documented ~5000-item ceiling.
const SELLER_EVENTS_SATURATION_THRESHOLD = 1000;
// Stop bisecting once a sub-window is this short. At this point we accept
// the (extremely unlikely) loss rather than fan out further.
const SELLER_EVENTS_MIN_WINDOW_MS = 15 * 60 * 1000;

interface ItemSummary {
  ItemID?: string;
}

interface ItemArrayResponse {
  ItemArray?: { Item?: ItemSummary | ItemSummary[] };
}

function extractItemArray(response: ItemArrayResponse): ItemSummary[] {
  const item = response.ItemArray?.Item;
  if (!item) {
    return [];
  }
  return Array.isArray(item) ? item : [item];
}

async function fetchItemDetails(
  client: eBayApi,
  itemSummaries: ItemSummary[]
): Promise<Listing[]> {
  const listings = await Promise.all(
    itemSummaries.map(async (itemSummary) => {
      if (!itemSummary.ItemID) {
        return null;
      }
      const itemResponse = await client.trading.GetItem({
        ItemID: itemSummary.ItemID,
        DetailLevel: "ReturnAll",
        IncludeItemSpecifics: true,
      });
      // Response Timestamp = observation version for tombstone ordering.
      return mapListing(
        itemResponse.Item,
        itemResponse.Timestamp ? new Date(itemResponse.Timestamp) : null
      );
    })
  );
  return listings.filter((listing): listing is Listing => listing !== null);
}

async function fetchSellerEventSummaries(
  client: eBayApi,
  modTimeFrom: Date,
  modTimeTo: Date
): Promise<ItemSummary[]> {
  const response = (await client.trading.GetSellerEvents({
    ModTimeFrom: modTimeFrom.toISOString(),
    ModTimeTo: modTimeTo.toISOString(),
  })) as ItemArrayResponse;

  const summaries = extractItemArray(response);

  // GetSellerEvents is non-paginated and silently truncates. If we got back
  // close to eBay's cap, bisect the window and merge. Stop bisecting once
  // sub-windows hit the floor — beyond that, further splitting is unlikely
  // to help and just multiplies API calls.
  const windowMs = modTimeTo.getTime() - modTimeFrom.getTime();
  if (
    summaries.length >= SELLER_EVENTS_SATURATION_THRESHOLD &&
    windowMs > SELLER_EVENTS_MIN_WINDOW_MS
  ) {
    const mid = new Date(modTimeFrom.getTime() + windowMs / 2);
    const [left, right] = await Promise.all([
      fetchSellerEventSummaries(client, modTimeFrom, mid),
      fetchSellerEventSummaries(client, mid, modTimeTo),
    ]);
    const seen = new Set<string>();
    return [...left, ...right].filter((summary) => {
      if (!summary.ItemID || seen.has(summary.ItemID)) {
        return false;
      }
      seen.add(summary.ItemID);
      return true;
    });
  }

  return summaries;
}

/**
 * Incremental path — uses GetSellerEvents which honors ModTimeFrom/To.
 * GetSellerList's ModTimeFrom is silently ignored on this surface, so for
 * incremental syncs (within the 48h GetSellerEvents window) we route here.
 *
 * GetSellerEvents has no pagination, so on saturation we bisect the window
 * recursively rather than dropping the surplus.
 */
async function getListingsViaSellerEvents(
  client: eBayApi,
  modifiedSince: Date
): Promise<PageResult<Listing>> {
  const summaries = await fetchSellerEventSummaries(
    client,
    modifiedSince,
    new Date()
  );
  if (summaries.length === 0) {
    return { data: [], cursor: null };
  }

  const data = await fetchItemDetails(client, summaries);
  return { data, cursor: null };
}

/**
 * Full-pull path — paginated via GetSellerList. Used for first-ever syncs,
 * forceRefresh, and any incremental call older than the 48h GetSellerEvents
 * window (rare; only happens after extended downtime).
 */
async function getListingsViaSellerList(
  client: eBayApi,
  options?: GetListingsOptions
): Promise<PageResult<Listing>> {
  const page = options?.cursor
    ? Number.parseInt(options.cursor.replace("page:", ""), 10)
    : 1;

  const endTimeFrom = (options?.endTimeFrom ?? new Date()).toISOString();
  const endTimeTo = (
    options?.endTimeTo ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  ).toISOString();

  const response = await client.trading.GetSellerList({
    Pagination: { EntriesPerPage: ENTRIES_PER_PAGE, PageNumber: page },
    GranularityLevel: "Coarse",
    EndTimeFrom: endTimeFrom,
    EndTimeTo: endTimeTo,
  });

  const summaries = extractItemArray(response);
  if (summaries.length === 0) {
    return { data: [], cursor: null };
  }

  const data = await fetchItemDetails(client, summaries);
  const hasMore = response.HasMoreItems ?? false;
  return { data, cursor: hasMore ? `page:${page + 1}` : null };
}

/**
 * Fetch one page of listings from eBay via the Trading API.
 *
 * Routes between two underlying calls based on the `modifiedSince` watermark:
 * - Within the last ~47h → GetSellerEvents (true ModTime filter, single page).
 * - Otherwise → GetSellerList (paginated full pull).
 *
 * The cursor is opaque to callers; pass it back unchanged for the next page.
 */
export async function getListings(
  client: eBayApi,
  options?: GetListingsOptions
): Promise<PageResult<Listing>> {
  const modifiedSince = options?.modifiedSince;
  const isWithinEventsWindow =
    modifiedSince !== undefined &&
    Date.now() - modifiedSince.getTime() <= SELLER_EVENTS_MAX_RANGE_MS;

  // GetSellerEvents is one-shot; only use it on the first page of an
  // incremental run. Subsequent cursor pages always fall through to the
  // paginated GetSellerList path (which only fires on full pulls anyway).
  if (isWithinEventsWindow && modifiedSince && !options?.cursor) {
    return await getListingsViaSellerEvents(client, modifiedSince);
  }

  return await getListingsViaSellerList(client, options);
}
