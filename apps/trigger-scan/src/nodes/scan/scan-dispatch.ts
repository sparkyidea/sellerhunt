import { db } from "@dashseller/db";
import { scanKeyword, scanListing, scanSeller } from "@dashseller/db/schema";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { ScanEntity } from "../../utils/scan-capabilities";
import { cronBatchSizeSchema } from "../../utils/scan-config";
import { freshnessCutoff } from "../../utils/scan-cooldowns";

const TABLES = {
  listing: {
    table: scanListing,
    reference: scanListing.reference,
    eligible: eq(scanListing.qualified, true),
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

export function firstScanCap(batchSize: number): number {
  return Math.ceil(cronBatchSizeSchema.parse(batchSize) / 2);
}

/** Busy rows are excluded BEFORE LIMIT, including inside the first-scan allowance. */
export async function pickStale(
  entity: ScanEntity,
  marketplace: string,
  batchSize: number,
  exclude: ReadonlySet<string>
): Promise<string[]> {
  const firstScanLimit = firstScanCap(batchSize);
  const { table, reference, eligible } = TABLES[entity];
  // Reused in two predicates: bind arrays so backlog size cannot exhaust SQL parameters.
  const notBusy =
    exclude.size > 0
      ? sql`${reference} <> ALL(${sql.param([...exclude])}::text[])`
      : undefined;
  const firstScans = sql`(select ${table.id} from ${table} where ${and(eq(table.marketplace, marketplace), isNull(table.lastScannedAt), notBusy, eligible)} order by ${table.id} limit ${firstScanLimit})`;
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
        notBusy,
        eligible,
        or(isNotNull(table.lastScannedAt), inArray(table.id, firstScans))
      )
    )
    .orderBy(sql`${table.lastScannedAt} ASC NULLS FIRST`, asc(table.id))
    .limit(batchSize);
  return rows.map((row) => row.reference);
}
