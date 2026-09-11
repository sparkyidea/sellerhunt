import { db } from "@dashseller/db";
import { scanKeyword, scanListing, scanSeller } from "@dashseller/db/schema";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { ScanEntity } from "../../utils/scan-capabilities";
import { freshnessCutoff } from "../../utils/scan-cooldowns";

const TABLES = {
  listing: {
    table: scanListing,
    reference: scanListing.reference,
    eligible: undefined,
  },
  seller: {
    table: scanSeller,
    reference: scanSeller.reference,
    eligible: undefined,
  },
  keyword: {
    table: scanKeyword,
    reference: scanKeyword.keyword,
    eligible: isNull(scanKeyword.deadAt),
  },
};

export async function pickStale(
  entity: ScanEntity,
  marketplace: string,
  batchSize: number
): Promise<string[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    return [];
  }
  const { table, reference, eligible } = TABLES[entity];
  const rows = await db
    .select({ reference })
    .from(table)
    .where(
      and(
        eq(table.marketplace, marketplace),
        or(
          isNull(table.lastScannedAt),
          lte(table.lastScannedAt, freshnessCutoff(entity))
        ),
        eligible
      )
    )
    .orderBy(sql`${table.lastScannedAt} ASC NULLS FIRST`, asc(table.id))
    .limit(batchSize);
  return rows.map((row) => row.reference);
}
