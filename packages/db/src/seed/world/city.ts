import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { city } from "../../schema/world";
import {
  CHUNK_SIZE,
  cityKey,
  type Db,
  emptyToNull,
  numberOrNull,
  stateKey,
} from "./shared";

interface CityAccumulator {
  count: number;
  countryId: string;
  latSum: number;
  lonSum: number;
  name: string;
  stateCode: string | null;
}

interface CityRow {
  countryId: string;
  latitude: number | null;
  longitude: number | null;
  name: string;
  stateId: string | null;
}

interface ParsedCityLine {
  countryId: string;
  lat: number | null;
  lon: number | null;
  placeName: string;
  stateCode: string | null;
}

function parseCityLine(
  line: string,
  filter: Set<string> | null,
  countryIdByCode: Map<string, string>
): ParsedCityLine | null {
  if (!line) {
    return null;
  }
  const parts = line.split("\t");
  if (parts.length < 11) {
    return null;
  }
  const cca2 = parts[0]?.toUpperCase();
  const placeName = emptyToNull(parts[2]);
  if (!(cca2 && placeName)) {
    return null;
  }
  if (filter && !filter.has(cca2)) {
    return null;
  }
  const countryId = countryIdByCode.get(cca2);
  if (!countryId) {
    return null;
  }
  return {
    countryId,
    stateCode: emptyToNull(parts[4]),
    placeName,
    lat: numberOrNull(parts[9]),
    lon: numberOrNull(parts[10]),
  };
}

function recordCity(acc: Map<string, CityAccumulator>, p: ParsedCityLine) {
  const key = cityKey(p.countryId, p.stateCode, p.placeName);
  const existing = acc.get(key);
  if (existing) {
    if (p.lat !== null && p.lon !== null) {
      existing.latSum += p.lat;
      existing.lonSum += p.lon;
      existing.count += 1;
    }
    return;
  }
  acc.set(key, {
    countryId: p.countryId,
    stateCode: p.stateCode,
    name: p.placeName,
    latSum: p.lat ?? 0,
    lonSum: p.lon ?? 0,
    count: p.lat !== null && p.lon !== null ? 1 : 0,
  });
}

async function aggregate(
  geonamesFile: string,
  filter: Set<string> | null,
  countryIdByCode: Map<string, string>
): Promise<Map<string, CityAccumulator>> {
  const acc = new Map<string, CityAccumulator>();
  const stream = createReadStream(geonamesFile, { encoding: "utf-8" });
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of rl) {
    const parsed = parseCityLine(line, filter, countryIdByCode);
    if (parsed) {
      recordCity(acc, parsed);
    }
  }
  return acc;
}

interface InsertableCity {
  countryId: string;
  latitude: number | null;
  longitude: number | null;
  name: string;
  /**
   * Every input cityKey (= countryId|stateCode|name) that maps to this row.
   * Multiple stateCodes can collapse here when they resolve to the same
   * stateId (e.g. non-US stateCodes all → null because we don't seed
   * non-US states). All of them must map to the surviving cityId so the
   * zip seed's cityKey lookups still work.
   */
  sourceKeys: string[];
  stateId: string | null;
}

/**
 * Merge accumulator entries by their DB-level key (countryId, stateId, name).
 * Without this, two cities with different stateCodes resolving to the same
 * stateId (commonly null for non-US) would collide on the unique index
 * inside a single INSERT batch ("ON CONFLICT DO UPDATE command cannot
 * affect row a second time").
 */
function buildRows(
  acc: Map<string, CityAccumulator>,
  stateIdByKey: Map<string, string>
): InsertableCity[] {
  const merged = new Map<
    string,
    {
      count: number;
      countryId: string;
      latSum: number;
      lonSum: number;
      name: string;
      sourceKeys: string[];
      stateId: string | null;
    }
  >();

  for (const a of acc.values()) {
    const stateId = a.stateCode
      ? (stateIdByKey.get(stateKey(a.countryId, a.stateCode)) ?? null)
      : null;
    const dbKey = `${a.countryId}\t${stateId ?? ""}\t${a.name}`;
    const sourceKey = cityKey(a.countryId, a.stateCode, a.name);
    const existing = merged.get(dbKey);
    if (existing) {
      existing.latSum += a.latSum;
      existing.lonSum += a.lonSum;
      existing.count += a.count;
      existing.sourceKeys.push(sourceKey);
    } else {
      merged.set(dbKey, {
        countryId: a.countryId,
        stateId,
        name: a.name,
        latSum: a.latSum,
        lonSum: a.lonSum,
        count: a.count,
        sourceKeys: [sourceKey],
      });
    }
  }

  const rows: InsertableCity[] = [];
  for (const m of merged.values()) {
    rows.push({
      countryId: m.countryId,
      stateId: m.stateId,
      name: m.name,
      latitude: m.count > 0 ? m.latSum / m.count : null,
      longitude: m.count > 0 ? m.lonSum / m.count : null,
      sourceKeys: m.sourceKeys,
    });
  }
  return rows;
}

/**
 * Upsert a chunk of cities. Returning() gives back the canonical id for both
 * inserts and conflict-updates; we propagate it to every input cityKey via
 * the row's sourceKeys.
 */
async function upsertChunk(
  db: Db,
  chunk: InsertableCity[],
  cityIdByKey: Map<string, string>
): Promise<void> {
  const values: CityRow[] = chunk.map((c) => ({
    countryId: c.countryId,
    stateId: c.stateId,
    name: c.name,
    latitude: c.latitude,
    longitude: c.longitude,
  }));
  const returned = await db
    .insert(city)
    .values(values)
    .onConflictDoUpdate({
      target: [city.countryId, city.stateId, city.name],
      targetWhere: undefined,
      set: {
        latitude: sql`EXCLUDED.latitude`,
        longitude: sql`EXCLUDED.longitude`,
      },
    })
    .returning({
      id: city.id,
      countryId: city.countryId,
      stateId: city.stateId,
      name: city.name,
    });

  const idLookup = new Map<string, string>();
  for (const r of returned) {
    idLookup.set(`${r.countryId}\t${r.stateId ?? ""}\t${r.name}`, r.id);
  }
  for (const c of chunk) {
    const dbKey = `${c.countryId}\t${c.stateId ?? ""}\t${c.name}`;
    const id = idLookup.get(dbKey);
    if (!id) {
      continue;
    }
    for (const sk of c.sourceKeys) {
      cityIdByKey.set(sk, id);
    }
  }
}

/**
 * Walks GeoNames once. Aggregates a centroid per (country, state, name),
 * resolves stateId from the state map, upserts deduped cities, and returns
 * cityKey -> cityId for the zipcode pass. Re-runs are idempotent thanks to
 * the (countryId, stateId, name) NULLS NOT DISTINCT unique index.
 */
export async function seedCities(
  db: Db,
  geonamesFile: string,
  stateIdByKey: Map<string, string>,
  countryIdByCode: Map<string, string>,
  countryFilter: Set<string> | null
): Promise<Map<string, string>> {
  console.log("[city] aggregating cities from GeoNames...");
  const acc = await aggregate(geonamesFile, countryFilter, countryIdByCode);
  console.log(`[city] ${acc.size.toLocaleString()} unique cities`);

  const insertables = buildRows(acc, stateIdByKey);
  const cityIdByKey = new Map<string, string>();
  let processed = 0;
  for (let i = 0; i < insertables.length; i += CHUNK_SIZE) {
    const chunk = insertables.slice(i, i + CHUNK_SIZE);
    await upsertChunk(db, chunk, cityIdByKey);
    processed += chunk.length;
    if (processed % 50_000 === 0) {
      console.log(`[city] upserted ${processed.toLocaleString()}...`);
    }
  }
  console.log(`[city] upserted ${processed.toLocaleString()}`);

  return cityIdByKey;
}

interface ParsedCity500 {
  countryId: string;
  latitude: number | null;
  longitude: number | null;
  name: string;
  stateCode: string | null;
}

/**
 * cities500 columns (TSV, no header):
 *   1 name, 4 latitude, 5 longitude, 6 feature class,
 *   8 country code, 10 admin1 code
 * See https://download.geonames.org/export/dump/readme.txt
 */
function parseCity500Line(
  line: string,
  filter: Set<string> | null,
  countryIdByCode: Map<string, string>
): ParsedCity500 | null {
  if (!line) {
    return null;
  }
  const parts = line.split("\t");
  if (parts.length < 11) {
    return null;
  }
  if (parts[6] !== "P") {
    return null;
  }
  const cca2 = parts[8]?.toUpperCase();
  const name = parts[1];
  if (!(cca2 && name)) {
    return null;
  }
  if (filter && !filter.has(cca2)) {
    return null;
  }
  const countryId = countryIdByCode.get(cca2);
  if (!countryId) {
    return null;
  }
  return {
    countryId,
    stateCode: emptyToNull(parts[10]),
    name,
    latitude: numberOrNull(parts[4]),
    longitude: numberOrNull(parts[5]),
  };
}

interface City500Row {
  countryId: string;
  latitude: number | null;
  longitude: number | null;
  name: string;
  stateId: string | null;
}

async function flushEnrichment(db: Db, rows: City500Row[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db
    .insert(city)
    .values(rows)
    .onConflictDoUpdate({
      target: [city.countryId, city.stateId, city.name],
      set: {
        latitude: sql`EXCLUDED.latitude`,
        longitude: sql`EXCLUDED.longitude`,
      },
    });
}

/**
 * Streams cities500.txt and upserts each populated place into `city`.
 * - Existing rows (from postal seed) get the true GeoNames centroid.
 * - cities500 entries with no postal match are inserted (cities without ZIPs).
 *
 * cities500 lists the same logical city under multiple feature codes
 * (PPL / PPLA / PPLA2 — populated place vs admin-division capitals), so a
 * single buffer can contain duplicate (countryId, stateId, name) rows. We
 * dedupe per buffer with a Map (last-write-wins) so ON CONFLICT only sees
 * one row per key.
 */
export async function enrichCitiesFromCities500(
  db: Db,
  cities500File: string,
  stateIdByKey: Map<string, string>,
  countryIdByCode: Map<string, string>,
  countryFilter: Set<string> | null
): Promise<void> {
  console.log("[city] enriching from cities500...");
  const stream = createReadStream(cities500File, { encoding: "utf-8" });
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let buffer = new Map<string, City500Row>();
  let processed = 0;
  for await (const line of rl) {
    const parsed = parseCity500Line(line, countryFilter, countryIdByCode);
    if (!parsed) {
      continue;
    }
    const stateId = parsed.stateCode
      ? (stateIdByKey.get(stateKey(parsed.countryId, parsed.stateCode)) ?? null)
      : null;
    const key = `${parsed.countryId}\t${stateId ?? ""}\t${parsed.name}`;
    buffer.set(key, {
      countryId: parsed.countryId,
      stateId,
      name: parsed.name,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    });
    if (buffer.size >= CHUNK_SIZE) {
      await flushEnrichment(db, Array.from(buffer.values()));
      processed += buffer.size;
      buffer = new Map();
      if (processed % 50_000 === 0) {
        console.log(`[city] enriched ${processed.toLocaleString()}...`);
      }
    }
  }
  if (buffer.size > 0) {
    await flushEnrichment(db, Array.from(buffer.values()));
    processed += buffer.size;
  }
  console.log(
    `[city] enriched ${processed.toLocaleString()} cities500 entries`
  );
}
