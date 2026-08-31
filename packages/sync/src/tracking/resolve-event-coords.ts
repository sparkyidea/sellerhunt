import { city, country, state, zip } from "@dashseller/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import type { SyncContext } from "../context";

export interface ResolveEventCoordsInput {
  locationCity: string | null;
  locationCountry: string | null;
  locationState: string | null;
  locationZip: string | null;
}

export interface ResolvedCoords {
  latitude: number | null;
  longitude: number | null;
}

const NULL_COORDS: ResolvedCoords = { latitude: null, longitude: null };

/**
 * Three-tier coord lookup for a tracking event, against the seeded
 * world tables only:
 *
 *   1. zip          — `zip.code = event.locationZip`
 *   2. city + state — `city.name ilike event.locationCity` joined to state/country
 *   3. state        — state centroid as a final fallback
 *
 * Returns `{ null, null }` when every tier misses. USPS facility
 * events whose structured columns parse to nothing (e.g. "METRO NY
 * DISTRIBUTION CENTER" — neither city nor state extracted) render
 * no map dot — acceptable until the geocoder swap-out adds tier 3.5
 * for free-text resolution.
 *
 * Country defaults to `"US"` when the event has no country code.
 */
export async function resolveEventCoords(
  ctx: SyncContext,
  input: ResolveEventCoordsInput
): Promise<ResolvedCoords> {
  const countryCode = (input.locationCountry ?? "US").toUpperCase();
  const stateCode = input.locationState?.toUpperCase() ?? null;

  const zipHit = await lookupZip(ctx, input.locationZip);
  if (zipHit) {
    return zipHit;
  }

  const cityHit = await lookupCity(ctx, {
    cityName: input.locationCity,
    stateCode,
    countryCode,
  });
  if (cityHit) {
    return cityHit;
  }

  const stateHit = await lookupState(ctx, { stateCode, countryCode });
  if (stateHit) {
    return stateHit;
  }

  return NULL_COORDS;
}

async function lookupZip(
  ctx: SyncContext,
  zipCode: string | null
): Promise<ResolvedCoords | null> {
  if (!zipCode) {
    return null;
  }
  const [row] = await ctx.db
    .select({ latitude: zip.latitude, longitude: zip.longitude })
    .from(zip)
    .where(eq(zip.code, zipCode))
    .limit(1);
  if (row?.latitude == null || row?.longitude == null) {
    return null;
  }
  return { latitude: row.latitude, longitude: row.longitude };
}

async function lookupCity(
  ctx: SyncContext,
  args: {
    cityName: string | null;
    countryCode: string;
    stateCode: string | null;
  }
): Promise<ResolvedCoords | null> {
  if (!(args.cityName && args.stateCode)) {
    return null;
  }
  const [row] = await ctx.db
    .select({ latitude: city.latitude, longitude: city.longitude })
    .from(city)
    .innerJoin(country, eq(city.countryId, country.id))
    .innerJoin(state, eq(city.stateId, state.id))
    .where(
      and(
        eq(country.code, args.countryCode),
        eq(state.code, args.stateCode),
        ilike(city.name, args.cityName)
      )
    )
    .limit(1);
  if (row?.latitude == null || row?.longitude == null) {
    return null;
  }
  return { latitude: row.latitude, longitude: row.longitude };
}

async function lookupState(
  ctx: SyncContext,
  args: {
    countryCode: string;
    stateCode: string | null;
  }
): Promise<ResolvedCoords | null> {
  if (!args.stateCode) {
    return null;
  }
  const [row] = await ctx.db
    .select({ latitude: state.latitude, longitude: state.longitude })
    .from(state)
    .innerJoin(country, eq(state.countryId, country.id))
    .where(
      and(eq(country.code, args.countryCode), eq(state.code, args.stateCode))
    )
    .limit(1);
  if (row?.latitude == null || row?.longitude == null) {
    return null;
  }
  return { latitude: row.latitude, longitude: row.longitude };
}
