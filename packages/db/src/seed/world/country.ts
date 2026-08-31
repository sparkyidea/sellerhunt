import { sql } from "drizzle-orm";
import { country } from "../../schema/world";
import { CHUNK_SIZE, type Db } from "./shared";

const REST_COUNTRIES_URL =
  "https://restcountries.com/v3.1/all?fields=name,cca2,flag,currencies,latlng";

interface RestCountry {
  cca2?: string;
  currencies?: Record<string, { name?: string; symbol?: string }>;
  flag?: string;
  latlng?: [number, number];
  name?: { common?: string; official?: string };
}

/**
 * Convert ISO 3166-1 alpha-2 to "U+1F1?? U+1F1??" — each letter maps to a
 * regional-indicator symbol at U+1F1E6 + (letter - 'A').
 */
function isoToUnicodeFlag(cca2: string): string {
  const base = 0x1_f1_e6;
  const aCode = "A".charCodeAt(0);
  const cps = cca2
    .toUpperCase()
    .split("")
    .map(
      (c) =>
        `U+${(base + (c.charCodeAt(0) - aCode)).toString(16).toUpperCase()}`
    );
  return cps.join(" ");
}

/**
 * Upserts countries by ISO code. Returns a (cca2 -> countryId) map so
 * downstream phases can resolve their FKs without re-querying.
 */
export async function seedCountries(db: Db): Promise<Map<string, string>> {
  console.log("[country] fetching REST Countries v3.1...");
  const res = await fetch(REST_COUNTRIES_URL);
  if (!res.ok) {
    throw new Error(`REST Countries fetch failed: ${res.status}`);
  }
  const raw = (await res.json()) as RestCountry[];

  const rows = raw
    .filter((c) => c.cca2 && c.name?.common)
    .map((c) => {
      const cca2 = c.cca2 as string;
      const currencyEntries = Object.entries(c.currencies ?? {});
      const [currencyCode, currencyMeta] = currencyEntries[0] ?? ["", {}];
      const [latitude, longitude] = c.latlng ?? [];
      return {
        name: c.name?.common as string,
        code: cca2,
        emoji: c.flag ?? "",
        emojiUnicode: isoToUnicodeFlag(cca2),
        currency: currencyMeta?.name ?? "",
        currencyCode: currencyCode ?? "",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      };
    });

  const countryIdByCode = new Map<string, string>();
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const returned = await db
      .insert(country)
      .values(chunk)
      .onConflictDoUpdate({
        target: country.code,
        set: {
          name: sql`EXCLUDED.name`,
          emoji: sql`EXCLUDED.emoji`,
          emojiUnicode: sql`EXCLUDED.emoji_unicode`,
          currency: sql`EXCLUDED.currency`,
          currencyCode: sql`EXCLUDED.currency_code`,
          latitude: sql`EXCLUDED.latitude`,
          longitude: sql`EXCLUDED.longitude`,
        },
      })
      .returning({ id: country.id, code: country.code });
    for (const r of returned) {
      countryIdByCode.set(r.code, r.id);
    }
  }
  console.log(`[country] upserted ${countryIdByCode.size}`);
  return countryIdByCode;
}
