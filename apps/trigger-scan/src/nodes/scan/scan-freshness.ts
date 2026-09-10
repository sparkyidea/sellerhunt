/**
 * Freshness prefilters — split a batch of references into "fresh" (stored
 * row scanned after the cooldown cutoff) and "stale" (everything else) in one
 * query per 1000 references, instead of one query per id.
 *
 * Parents call these BEFORE enqueueing children ("stale at enqueue time"), so
 * fresh sellers can avoid an unnecessary child run, and the listing leaf
 * calls them ONCE before loading a persona ("stale at run time"), so a batch
 * of already-fresh ids costs no sleeps, no persona load and no HTTP.
 *
 * Cutoff semantics match the child gates these replace: fresh means
 * `last_scanned_at > cutoff` (strict). A null timestamp never matches, so a
 * bare seller row (created by the listing leaf to satisfy the FK) is stale.
 * These reads do not claim work: two runs that both partition before either
 * persists can still scan the same entity. Durable ownership is Issue #11.
 */
import { db } from "@dashseller/db";
import { scanListing, scanSeller } from "@dashseller/db/schema";
import { logger } from "@trigger.dev/sdk";
import { and, eq, gt, inArray } from "drizzle-orm";
import { chunk } from "../../utils/chunk";
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
  /** One stored verdict per fresh input occurrence, in input order. */
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
 * yield duplicated verdicts to preserve an outcome per input occurrence; an
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
        qualified: scanListing.qualified,
        reference: scanListing.reference,
        title: scanListing.title,
        categoryPath: scanListing.categoryPath,
        price: scanListing.price,
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
    const verdict = row
      ? verdictFromStoredListing(row, marketplace, config)
      : null;
    if (verdict) {
      verdicts.push(verdict);
    } else {
      stale.push(input);
    }
  }

  logger.info("Partitioned listings by freshness", {
    marketplace,
    requested: ids.length,
    fresh: verdicts.length,
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
