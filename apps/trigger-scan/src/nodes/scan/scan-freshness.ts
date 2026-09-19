import { listingPriceMin } from "@dashseller/db/lib/scan-listing-observation";
import { scanListing, scanSeller } from "@dashseller/db/schema";
import { logger } from "@trigger.dev/sdk";
import { and, eq, gt, inArray } from "drizzle-orm";
import { chunk } from "../../utils/chunk";
import { db } from "../../utils/db";
import type { ScanConfig } from "../../utils/scan-config";
import { freshnessCutoff } from "../../utils/scan-cooldowns";
import { extractListingId } from "./extract-listing-id";
import {
  type ListingVerdict,
  type StoredListingRow,
  verdictFromStoredListing,
} from "./listing-verdict";

/** References per `IN (...)` list — bounded so a whole catalog stays under the bind-parameter cap. */
const FRESHNESS_QUERY_CHUNK = 1000;

export interface FreshListingPartition {
  /** Inputs with no fresh row, as ORIGINALLY given (URLs stay URLs). */
  stale: string[];
  /** Qualifying fresh listings only, preserving input occurrence order. */
  verdicts: ListingVerdict[];
}

export interface FreshSeller {
  lastScannedAt: Date;
  reference: string;
}

export interface FreshSellerPartition {
  /** Distinct fresh references, first-seen order. */
  fresh: FreshSeller[];
  /** Distinct stale references, first-seen order. */
  stale: string[];
}

/**
 * Partition listing ids (bare or URL) by listing freshness. Duplicated inputs
 * yield duplicated qualifying verdicts; cached nonqualifying rows are not stale. An
 * input `extractListingId` rejects is passed
 * through to `stale` untouched, so the leaf reports it the same way it did
 * before (as a per-listing failure).
 */
export async function partitionFreshListings(
  marketplace: string,
  ids: readonly string[],
  config: ScanConfig
): Promise<FreshListingPartition> {
  if (ids.length === 0) {
    return { verdicts: [], stale: [] };
  }
  const cutoff = freshnessCutoff("listing");
  const normalized = ids.map(normalizeListingId);
  const references = new Set<string>();
  for (const reference of normalized) {
    if (reference !== null) {
      references.add(reference);
    }
  }

  const rows = new Map<string, StoredListingRow>();
  for (const batch of chunk([...references], FRESHNESS_QUERY_CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const found = await db
      .select({
        id: scanListing.id,
        price: listingPriceMin(),
        reference: scanListing.reference,
        title: scanListing.title,
        categoryPath: scanListing.categoryPath,
        itemSold: scanListing.itemSold,
        soldLast24h: scanListing.soldLast24h,
        soldLast30Days: scanListing.soldLast30Days,
        sellerReference: scanSeller.reference,
      })
      .from(scanListing)
      .leftJoin(scanSeller, eq(scanListing.sellerId, scanSeller.id))
      .where(
        and(
          eq(scanListing.marketplace, marketplace),
          inArray(scanListing.reference, batch),
          gt(scanListing.lastScannedAt, cutoff)
        )
      );
    for (const row of found) {
      rows.set(row.reference, row);
    }
  }

  const verdicts: ListingVerdict[] = [];
  const stale: string[] = [];
  for (const [index, input] of ids.entries()) {
    const reference = normalized[index] ?? null;
    const row = reference === null ? undefined : rows.get(reference);
    if (!row) {
      stale.push(input);
      continue;
    }
    const verdict = verdictFromStoredListing(row, marketplace, config);
    if (verdict) {
      verdicts.push(verdict);
    }
  }

  logger.info("Partitioned listings by freshness", {
    marketplace,
    requested: ids.length,
    fresh: ids.length - stale.length,
    stale: stale.length,
    cutoff,
  });
  return { verdicts, stale };
}

/**
 * Partition seller references by seller freshness. Duplicates collapse to
 * their first occurrence: sellers are fired once per parent run regardless.
 */
export async function partitionFreshSellers(
  marketplace: string,
  references: readonly string[]
): Promise<FreshSellerPartition> {
  if (references.length === 0) {
    return { fresh: [], stale: [] };
  }
  const cutoff = freshnessCutoff("seller");
  const distinct = [...new Set(references)];

  const scannedAt = new Map<string, Date>();
  for (const batch of chunk(distinct, FRESHNESS_QUERY_CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const found = await db
      .select({
        reference: scanSeller.reference,
        lastScannedAt: scanSeller.lastScannedAt,
      })
      .from(scanSeller)
      .where(
        and(
          eq(scanSeller.marketplace, marketplace),
          inArray(scanSeller.reference, batch),
          gt(scanSeller.lastScannedAt, cutoff)
        )
      );
    for (const row of found) {
      if (row.lastScannedAt) {
        scannedAt.set(row.reference, row.lastScannedAt);
      }
    }
  }

  const fresh: FreshSeller[] = [];
  const stale: string[] = [];
  for (const reference of distinct) {
    const lastScannedAt = scannedAt.get(reference);
    if (lastScannedAt) {
      fresh.push({ reference, lastScannedAt });
    } else {
      stale.push(reference);
    }
  }

  logger.info("Partitioned sellers by freshness", {
    marketplace,
    requested: references.length,
    fresh: fresh.length,
    stale: stale.length,
    cutoff,
  });
  return { fresh, stale };
}

function normalizeListingId(input: string): string | null {
  try {
    return extractListingId(input);
  } catch {
    return null;
  }
}
