import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { zip } from "../../schema/world";
import {
  CHUNK_SIZE,
  cityKey,
  type Db,
  emptyToNull,
  numberOrNull,
} from "./shared";

interface ZipRow {
  cityId: string;
  code: string;
  latitude: number | null;
  longitude: number | null;
}

interface ParsedZip {
  cca2: string;
  cityId: string;
  code: string;
  latitude: number | null;
  longitude: number | null;
}

async function flush(db: Db, rows: ZipRow[]) {
  if (rows.length === 0) {
    return;
  }
  await db
    .insert(zip)
    .values(rows)
    .onConflictDoUpdate({
      target: [zip.cityId, zip.code],
      set: {
        latitude: sql`EXCLUDED.latitude`,
        longitude: sql`EXCLUDED.longitude`,
      },
    });
}

interface ParseResult {
  row: ParsedZip | null;
  skipped: { code: string; reason: "no_place_name" | "city_not_found" } | null;
}

function parseGeonamesLine(
  line: string,
  filter: Set<string> | null,
  cityIdByKey: Map<string, string>,
  countryIdByCode: Map<string, string>
): ParseResult {
  if (!line) {
    return { row: null, skipped: null };
  }
  const parts = line.split("\t");
  if (parts.length < 11) {
    return { row: null, skipped: null };
  }
  const cca2 = parts[0]?.toUpperCase();
  const code = parts[1];
  if (!(cca2 && code)) {
    return { row: null, skipped: null };
  }
  if (filter && !filter.has(cca2)) {
    return { row: null, skipped: null };
  }
  const countryId = countryIdByCode.get(cca2);
  if (!countryId) {
    return { row: null, skipped: null };
  }
  const placeName = emptyToNull(parts[2]);
  if (!placeName) {
    return {
      row: null,
      skipped: { code: `${cca2}/${code}`, reason: "no_place_name" },
    };
  }
  const stateCode = emptyToNull(parts[4]);
  const cityId = cityIdByKey.get(cityKey(countryId, stateCode, placeName));
  if (!cityId) {
    return {
      row: null,
      skipped: { code: `${cca2}/${code}`, reason: "city_not_found" },
    };
  }
  return {
    row: {
      cityId,
      code,
      cca2,
      latitude: numberOrNull(parts[9]),
      longitude: numberOrNull(parts[10]),
    },
    skipped: null,
  };
}

export async function seedZips(
  db: Db,
  geonamesFile: string,
  cityIdByKey: Map<string, string>,
  countryIdByCode: Map<string, string>,
  filter: Set<string> | null
): Promise<void> {
  console.log("[zip] reading GeoNames + joining to cities...");

  const stream = createReadStream(geonamesFile, { encoding: "utf-8" });
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let buffer: ZipRow[] = [];
  let total = 0;
  let skippedNoPlace = 0;
  const skippedNoCity: string[] = [];
  // GeoNames occasionally lists the same (city, postal) twice. Within a
  // single chunk we'd hit the unique constraint, so dedupe per-chunk and
  // let onConflictDoUpdate handle cross-chunk repeats.
  const seenInChunk = new Set<string>();

  for await (const line of rl) {
    const { row, skipped } = parseGeonamesLine(
      line,
      filter,
      cityIdByKey,
      countryIdByCode
    );
    if (skipped) {
      if (skipped.reason === "no_place_name") {
        skippedNoPlace += 1;
      } else {
        skippedNoCity.push(skipped.code);
      }
      continue;
    }
    if (!row) {
      continue;
    }
    const uniqKey = `${row.cityId}\t${row.code}`;
    if (seenInChunk.has(uniqKey)) {
      continue;
    }
    seenInChunk.add(uniqKey);
    buffer.push({
      cityId: row.cityId,
      code: row.code,
      latitude: row.latitude,
      longitude: row.longitude,
    });

    if (buffer.length >= CHUNK_SIZE) {
      await flush(db, buffer);
      total += buffer.length;
      buffer = [];
      seenInChunk.clear();
      if (total % 50_000 === 0) {
        console.log(`[zip] upserted ${total.toLocaleString()}...`);
      }
    }
  }
  if (buffer.length > 0) {
    await flush(db, buffer);
    total += buffer.length;
  }
  console.log(`[zip] upserted ${total.toLocaleString()}`);
  if (skippedNoPlace > 0) {
    console.log(
      `[zip] skipped ${skippedNoPlace.toLocaleString()} ZIPs with no place name`
    );
  }
  if (skippedNoCity.length > 0) {
    console.log(
      `[zip] skipped ${skippedNoCity.length.toLocaleString()} ZIPs whose place name didn't match any city:`
    );
    for (const c of skippedNoCity.slice(0, 50)) {
      console.log(`  ${c}`);
    }
    if (skippedNoCity.length > 50) {
      console.log(`  ... and ${skippedNoCity.length - 50} more`);
    }
  }
}
