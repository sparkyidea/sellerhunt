/**
 * Upsert a single row into `scan_seller` keyed on `(marketplace, reference)`.
 *
 * Returns the row id so the caller can wire it as the FK on a subsequent
 * `scan_listing` upsert.
 *
 * Designed to be called from both `scan-by-seller` (with stats from the
 * storefront endpoint) and `scan-listing` (with seller info embedded in the
 * listing detail) — fields not present in the input are omitted from the
 * update so a listing-only call doesn't blank out fields populated by an
 * earlier stats call.
 *
 * Does NOT bump `lastScannedAt`: that column gates the seller-mode freshness
 * check and must only advance when a full `scanListingsBySeller` (stats +
 * pagination + fan-out) completes. Per-listing seller writes would otherwise
 * silently suppress later seller scans. `updatedAt` is auto-bumped by the
 * schema on every write, which is the correct "we touched this row" signal.
 */
import { db } from "@dashseller/db";
import { scanSeller } from "@dashseller/db/schema";
import { and, eq } from "drizzle-orm";

export interface UpsertScanSellerInput {
  displayName?: string | null;
  /** Positive feedback ratio in 0..1 (e.g. 0.998 for 99.8%). */
  feedbackPercent?: number | null;
  /** Lifetime feedback count. */
  feedbackScore?: number | null;
  logoUrl?: string | null;
  marketplace: string;
  reference: string;
  totalItemsSold?: number | null;
}

export async function upsertScanSeller(
  input: UpsertScanSellerInput
): Promise<{ id: string }> {
  const setClause = buildSetClause(input);

  const [existing] = await db
    .select({ id: scanSeller.id })
    .from(scanSeller)
    .where(
      and(
        eq(scanSeller.marketplace, input.marketplace),
        eq(scanSeller.reference, input.reference)
      )
    )
    .limit(1);

  if (existing) {
    // Bare upsert (only marketplace+reference, e.g. the FK-ensuring call from
    // the listing leaf) has nothing to set on an existing row — `.set({})`
    // throws "No values to set", so just return the id.
    if (Object.keys(setClause).length > 0) {
      await db
        .update(scanSeller)
        .set(setClause)
        .where(eq(scanSeller.id, existing.id));
    }
    return { id: existing.id };
  }

  const [inserted] = await db
    .insert(scanSeller)
    .values({
      marketplace: input.marketplace,
      reference: input.reference,
      ...setClause,
    })
    .returning({ id: scanSeller.id });

  if (!inserted) {
    throw new Error(
      `upsertScanSeller: insert returned no row for ${input.marketplace}/${input.reference}`
    );
  }
  return { id: inserted.id };
}

function buildSetClause(input: UpsertScanSellerInput): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  if (input.displayName !== undefined) {
    set.displayName = input.displayName;
  }
  if (input.logoUrl !== undefined) {
    set.logoUrl = input.logoUrl;
  }
  if (input.feedbackScore !== undefined) {
    set.feedbackScore = input.feedbackScore;
  }
  if (input.feedbackPercent !== undefined) {
    set.feedbackPercent =
      input.feedbackPercent === null ? null : input.feedbackPercent.toFixed(4);
  }
  if (input.totalItemsSold !== undefined) {
    set.totalItemsSold = input.totalItemsSold;
  }
  return set;
}
