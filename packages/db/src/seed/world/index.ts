/**
 * Seed country / state / city / zipcode / tax_rate from public datasets.
 *
 * Sources (downloaded at runtime — nothing committed):
 *   - country:   https://restcountries.com/v3.1/all
 *   - state:     https://developers.google.com/public-data/docs/canonical/states_csv
 *   - city/zip:  https://download.geonames.org/export/zip/allCountries.zip
 *   - tax_rate:  https://www.avalara.com/.../state-rate-downloader.zip
 *
 * Order matters — each phase relies on FKs to the prior one.
 *
 * Usage:
 *   bun run packages/db/src/seed/world/index.ts [--countries=US,CA]
 *
 * CLI:
 *   --countries=US,CA           Comma-separated cca2 list for the city +
 *                                zipcode phases. Overrides ZIPCODE_COUNTRIES.
 *
 * Env flags:
 *   ZIPCODE_COUNTRIES="US,CA"   Same as --countries; CLI takes precedence.
 *                                Unset = all countries (~1.5M zipcodes).
 *   SKIP_COUNTRIES=1            Skip country phase.
 *   SKIP_STATES=1               Skip state phase.
 *   SKIP_CITIES=1               Skip city + zipcode phases.
 *   SKIP_TAX_RATES=1            Skip tax_rate phase.
 *
 * Re-seeding: this script upserts where possible, but the `city` table has
 * no unique constraint (nullable columns + Postgres NULL-distinct semantics).
 * To get a clean re-seed, truncate first:
 *   TRUNCATE tax_rate, zipcode, city, state, country RESTART IDENTITY CASCADE;
 *
 * Downloads are cached in `packages/db/tmp/world-seed/` and reused across runs.
 * Delete that folder to force a fresh fetch.
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { country, state } from "../../schema/world";
import { enrichCitiesFromCities500, seedCities } from "./city";
import { seedCountries } from "./country";
import { type Db, downloadToFile, makeDb, stateKey, unzipTo } from "./shared";
import { seedStates } from "./state";
import { seedTaxRates } from "./tax-rate";
import { seedZips } from "./zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, "../../../../../apps/api/.env"),
});

const WORK_DIR = resolve(__dirname, "../../../tmp/world-seed");

const GEONAMES_URL =
  "https://download.geonames.org/export/zip/allCountries.zip";
const CITIES500_URL = "https://download.geonames.org/export/dump/cities500.zip";

interface ZipOverride {
  cca2: string;
  cityName: string;
  code: string;
  latitude: number;
  longitude: number;
  stateCode: string;
}

/**
 * Format a manual override as a GeoNames postal TSV row. GeoNames columns:
 *   0 country  1 postal  2 placeName  3 admin1Name  4 admin1Code
 *   5 admin2Name  6 admin2Code  7 admin3Name  8 admin3Code
 *   9 latitude  10 longitude  11 accuracy
 */
function formatOverrideLine(o: ZipOverride): string {
  return [
    o.cca2,
    o.code,
    o.cityName,
    "",
    o.stateCode,
    "",
    "",
    "",
    "",
    String(o.latitude),
    String(o.longitude),
    "",
  ].join("\t");
}

/**
 * Append manually-curated zip rows (zip-overrides.json) to the extracted
 * GeoNames file so the city + zip seed phases pick them up via the normal
 * code path. Called only after a fresh extract; the cached-txt path already
 * has the appended rows from the previous extract. To pick up JSON edits,
 * delete `allCountries.txt` (or the whole tmp/world-seed folder).
 */
async function appendOverrides(txtPath: string) {
  const overridesPath = resolve(__dirname, "zip-overrides.json");
  const overrides: ZipOverride[] = JSON.parse(
    await readFile(overridesPath, "utf-8")
  );
  if (overrides.length === 0) {
    return;
  }
  const lines = `\n${overrides.map(formatOverrideLine).join("\n")}\n`;
  await appendFile(txtPath, lines);
  console.log(
    `[geonames] appended ${overrides.length} zip-overrides.json entries to allCountries.txt`
  );
}

async function downloadGeonames(workDir: string): Promise<string> {
  const zipPath = join(workDir, "allCountries.zip");
  const txtPath = join(workDir, "allCountries.txt");
  if (existsSync(txtPath)) {
    console.log("[geonames] using cached allCountries.txt");
    return txtPath;
  }
  if (existsSync(zipPath)) {
    console.log("[geonames] using cached allCountries.zip");
  } else {
    console.log(
      "[geonames] downloading allCountries.zip (~400MB compressed)..."
    );
    await downloadToFile(GEONAMES_URL, zipPath);
  }
  console.log("[geonames] extracting...");
  unzipTo(zipPath, workDir);
  await appendOverrides(txtPath);
  return txtPath;
}

async function downloadCities500(workDir: string): Promise<string> {
  const zipPath = join(workDir, "cities500.zip");
  const txtPath = join(workDir, "cities500.txt");
  if (existsSync(txtPath)) {
    console.log("[cities500] using cached cities500.txt");
    return txtPath;
  }
  if (existsSync(zipPath)) {
    console.log("[cities500] using cached cities500.zip");
  } else {
    console.log("[cities500] downloading cities500.zip (~13MB)...");
    await downloadToFile(CITIES500_URL, zipPath);
  }
  console.log("[cities500] extracting...");
  unzipTo(zipPath, workDir);
  return txtPath;
}

/**
 * Rebuild the (countryId|code) -> stateId map from existing rows when the
 * state phase is skipped. Cities/zipcodes still need this lookup.
 */
async function loadStateMap(db: Db): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: state.id, countryId: state.countryId, code: state.code })
    .from(state);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(stateKey(r.countryId, r.code), r.id);
  }
  console.log(`[state] loaded ${map.size} existing rows (SKIP_STATES=1)`);
  return map;
}

/**
 * Rebuild the (cca2 -> countryId) map from existing rows when the country
 * phase is skipped. All downstream phases need this to resolve FKs.
 */
async function loadCountryMap(db: Db): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: country.id, code: country.code })
    .from(country);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.code, r.id);
  }
  console.log(`[country] loaded ${map.size} existing rows (SKIP_COUNTRIES=1)`);
  return map;
}

/**
 * Resolve country filter for city + zipcode phases. Precedence:
 *   1. --countries=US,CA CLI arg
 *   2. ZIPCODE_COUNTRIES env var
 *   3. null = no filter (seed all countries)
 */
function resolveCountryFilter(): Set<string> | null {
  const cli = process.argv.slice(2).find((a) => a.startsWith("--countries="));
  const raw = cli
    ? cli.slice("--countries=".length)
    : process.env.ZIPCODE_COUNTRIES;
  if (!raw) {
    return null;
  }
  const list = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

async function main() {
  const db = makeDb();
  await mkdir(WORK_DIR, { recursive: true });

  const countryFilter = resolveCountryFilter();
  console.log(
    `[world] country filter: ${countryFilter ? Array.from(countryFilter).join(",") : "all countries"}`
  );

  const countryIdByCode =
    process.env.SKIP_COUNTRIES === "1"
      ? await loadCountryMap(db)
      : await seedCountries(db);
  const stateIdByKey =
    process.env.SKIP_STATES === "1"
      ? await loadStateMap(db)
      : await seedStates(db, countryIdByCode);
  if (process.env.SKIP_CITIES !== "1") {
    const geonamesFile = await downloadGeonames(WORK_DIR);
    const cityIdByKey = await seedCities(
      db,
      geonamesFile,
      stateIdByKey,
      countryIdByCode,
      countryFilter
    );
    const cities500File = await downloadCities500(WORK_DIR);
    await enrichCitiesFromCities500(
      db,
      cities500File,
      stateIdByKey,
      countryIdByCode,
      countryFilter
    );
    await seedZips(
      db,
      geonamesFile,
      cityIdByKey,
      countryIdByCode,
      countryFilter
    );
  }
  if (process.env.SKIP_TAX_RATES !== "1") {
    await seedTaxRates(db, WORK_DIR, countryIdByCode);
  }
  console.log("\nDone.");
}

try {
  await main();
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
}

process.exit(0);
