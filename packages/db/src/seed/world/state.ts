import { sql } from "drizzle-orm";
import { state } from "../../schema/world";
import { CHUNK_SIZE, type Db, stateKey } from "./shared";

const STATES_URL =
  "https://developers.google.com/public-data/docs/canonical/states_csv";
const TABLE_RE = /<table[^>]*>([\s\S]*?)<\/table>/i;
const ROW_RE = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
const TAG_RE = /<[^>]+>/g;

interface StateInsert {
  code: string;
  countryId: string;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
}

function parseStatesHtml(html: string, countryId: string): StateInsert[] {
  const tableMatch = html.match(TABLE_RE);
  if (!tableMatch) {
    throw new Error("No <table> found in Google states page");
  }
  const rows: StateInsert[] = [];
  const tableBody = tableMatch[1] ?? "";
  const trMatches = tableBody.match(ROW_RE) ?? [];
  for (let i = 1; i < trMatches.length; i++) {
    const tr = trMatches[i] ?? "";
    const cells: string[] = [];
    const cellMatches = tr.match(CELL_RE) ?? [];
    for (const c of cellMatches) {
      cells.push(c.replace(TAG_RE, "").trim());
    }
    if (cells.length < 4) {
      continue;
    }
    const code = cells[0];
    const latitude = Number(cells[1]);
    const longitude = Number(cells[2]);
    const name = cells[3];
    if (!code || Number.isNaN(latitude) || Number.isNaN(longitude) || !name) {
      continue;
    }
    rows.push({
      id: crypto.randomUUID(),
      countryId,
      code,
      name,
      latitude,
      longitude,
    });
  }
  return rows;
}

/**
 * Upserts US states. Returns a map of (countryId|code) -> stateId so the
 * city + zipcode phases can wire their FKs without re-querying.
 */
export async function seedStates(
  db: Db,
  countryIdByCode: Map<string, string>
): Promise<Map<string, string>> {
  const usCountryId = countryIdByCode.get("US");
  if (!usCountryId) {
    throw new Error("[state] US country row missing — seed countries first");
  }
  console.log("[state] fetching Google canonical states CSV...");
  const res = await fetch(STATES_URL);
  if (!res.ok) {
    throw new Error(`states fetch failed: ${res.status}`);
  }
  const html = await res.text();
  const rows = parseStatesHtml(html, usCountryId);
  console.log(`[state] parsed ${rows.length} states`);

  const stateIdByKey = new Map<string, string>();
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const returned = await db
      .insert(state)
      .values(chunk)
      .onConflictDoUpdate({
        target: [state.countryId, state.code],
        set: {
          name: sql`EXCLUDED.name`,
          latitude: sql`EXCLUDED.latitude`,
          longitude: sql`EXCLUDED.longitude`,
        },
      })
      .returning({
        id: state.id,
        countryId: state.countryId,
        code: state.code,
      });
    for (const r of returned) {
      stateIdByKey.set(stateKey(r.countryId, r.code), r.id);
    }
  }
  console.log(`[state] upserted ${stateIdByKey.size}`);
  return stateIdByKey;
}
