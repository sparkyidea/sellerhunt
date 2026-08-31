import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import Papa from "papaparse";
import { taxRate } from "../../schema/tax-rate";
import { city, zip } from "../../schema/world";
import { CHUNK_SIZE, type Db, downloadToFile, unzipTo } from "./shared";

const AVALARA_URL =
  "https://www.avalara.com/ava-servlets/servletpage/jcr:content.state-rate-downloader.zip";
const AVALARA_STATES =
  "ar,az,ct,de,id,hi,ks,ia,me,md,ms,mn,ne,nv,ny,nm,oh,ok,sc,ri,tx,ut,wv,wa,wy,wi,vt,va,tn,or,sd,pa,nd,nj,mt,ak,co,ga,in,la,mi,nc,nh,mo,ma,ky,il,fl,ca,al";

interface AvalaraCsvRow {
  EstimatedCombinedRate: string;
  State: string;
  TaxRegionName: string;
  ZipCode: string;
}

interface ZipAggregate {
  rate: string;
  state: string;
}

function parseDecimal(value: string | undefined): string | null {
  if (value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : value;
}

/**
 * Build (zip code -> zip.id[]) for US zips via the city chain. A single
 * postal code can map to multiple zip rows because `zip` is unique on
 * `(city_id, code)`, not code alone — the same ZIP can span cities and
 * each row needs its own tax_rate.
 */
async function loadUsZipIdMap(
  db: Db,
  usCountryId: string
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ id: zip.id, code: zip.code })
    .from(zip)
    .innerJoin(city, sql`${city.id} = ${zip.cityId}`)
    .where(sql`${city.countryId} = ${usCountryId}`);
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const existing = map.get(r.code);
    if (existing) {
      existing.push(r.id);
    } else {
      map.set(r.code, [r.id]);
    }
  }
  return map;
}

/**
 * Walk a single CSV. For each row, take the max combined rate per ZIP. We
 * also remember the state for orphan-logging purposes.
 */
async function collectFromCsv(
  csvPath: string,
  zipAggregate: Map<string, ZipAggregate>
): Promise<{ rows: number }> {
  const content = await readFile(csvPath, "utf-8");
  const parsed = Papa.parse<AvalaraCsvRow>(content, {
    header: true,
    skipEmptyLines: true,
  });

  let rows = 0;
  for (const r of parsed.data) {
    if (!(r.State && r.ZipCode)) {
      continue;
    }
    const rate = parseDecimal(r.EstimatedCombinedRate);
    if (!rate) {
      continue;
    }
    const existing = zipAggregate.get(r.ZipCode);
    if (existing === undefined || Number(rate) > Number(existing.rate)) {
      zipAggregate.set(r.ZipCode, { rate, state: r.State });
    }
    rows += 1;
  }
  return { rows };
}

export async function seedTaxRates(
  db: Db,
  workDir: string,
  countryIdByCode: Map<string, string>
): Promise<void> {
  const usCountryId = countryIdByCode.get("US");
  if (!usCountryId) {
    throw new Error("[tax_rate] US country row missing — seed countries first");
  }

  const zipPath = join(workDir, "avalara.zip");
  const extractDir = join(workDir, "avalara");

  if (existsSync(zipPath)) {
    console.log("[tax_rate] using cached avalara.zip");
  } else {
    console.log("[tax_rate] downloading Avalara state-rate-downloader.zip...");
    await downloadToFile(`${AVALARA_URL}?states=${AVALARA_STATES}`, zipPath);
  }

  await mkdir(extractDir, { recursive: true });
  console.log("[tax_rate] extracting...");
  unzipTo(zipPath, extractDir);

  console.log("[tax_rate] loading US zip id map...");
  const zipIdsByCode = await loadUsZipIdMap(db, usCountryId);
  console.log(
    `[tax_rate] ${zipIdsByCode.size.toLocaleString()} unique US zip codes in db`
  );

  const entries = await readdir(extractDir);
  const csvs = entries.filter((f) => f.toLowerCase().endsWith(".csv"));
  console.log(`[tax_rate] processing ${csvs.length} state CSVs`);

  const zipAggregate = new Map<string, ZipAggregate>();
  let totalRows = 0;
  for (const file of csvs) {
    const { rows } = await collectFromCsv(join(extractDir, file), zipAggregate);
    totalRows += rows;
    console.log(`  ${file}: ${rows.toLocaleString()} rows scanned`);
  }

  const upserts: { rate: string; zipId: string }[] = [];
  const orphans: { code: string; state: string }[] = [];
  for (const [code, { rate, state }] of zipAggregate) {
    const zipIds = zipIdsByCode.get(code);
    if (!zipIds) {
      orphans.push({ code, state });
      continue;
    }
    for (const zipId of zipIds) {
      upserts.push({ zipId, rate });
    }
  }

  for (let i = 0; i < upserts.length; i += CHUNK_SIZE) {
    const chunk = upserts.slice(i, i + CHUNK_SIZE);
    await db
      .insert(taxRate)
      .values(chunk)
      .onConflictDoUpdate({
        target: taxRate.zipId,
        set: {
          rate: sql`EXCLUDED.rate`,
          updatedAt: new Date(),
        },
      });
  }
  const matchedCodes = zipAggregate.size - orphans.length;
  console.log(
    `[tax_rate] upserted ${upserts.length.toLocaleString()} zip rows (covering ${matchedCodes.toLocaleString()} ZIPs from ${totalRows.toLocaleString()} CSV rows)`
  );
  if (orphans.length > 0) {
    console.log(
      `[tax_rate] skipped ${orphans.length} Avalara ZIPs with no matching zip row (military/unique ZIPs — add manually if needed):`
    );
    for (const o of orphans) {
      console.log(`  ${o.code} (state=${o.state})`);
    }
  }
}
