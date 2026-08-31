import {
  doublePrecision,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Geographic reference data — country, state, city, zip.
 * Populated by `packages/db/src/seed/world/`.
 *
 * Hierarchy (FKs cascade-delete downstream):
 *   country -> state -> city -> zip
 *
 * Each level references only its immediate parent; reach higher levels via
 * the chain (e.g. zip.cityId.stateId.countryId). state is nullable on city
 * for non-US countries; everything else is required.
 */

export const country = pgTable(
  "country",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    /** ISO 3166-1 alpha-2 code, e.g. "US". Natural lookup key. */
    code: text("code").notNull(),
    emoji: text("emoji").notNull(),
    emojiUnicode: text("emoji_unicode").notNull(),
    currency: text("currency").notNull(),
    currencyCode: text("currency_code").notNull(),
    /** Country centroid — REST Countries `latlng`. Nullable for some territories. */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
  },
  (t) => [uniqueIndex("country_code_unique").on(t.code)]
);

export const state = pgTable(
  "state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    countryId: text("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "cascade" }),
    /** Subdivision code within the country, e.g. "CA". */
    code: text("code").notNull(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
  },
  (t) => [uniqueIndex("state_country_code_unique").on(t.countryId, t.code)]
);

/**
 * Cities / populated places. Two-pass seed:
 *  1. Postal-derived: one row per GeoNames postal place (preserves ZIP→city).
 *     Centroid is the mean of member zip centroids.
 *  2. cities500 enrichment: matched rows get the true GeoNames centroid.
 *     Unmatched cities500 entries are inserted as new rows (cities with no
 *     ZIPs — e.g. neighborhood-level entries).
 *
 * Uniqueness on (countryId, stateId, name) via NULLS NOT DISTINCT (PG15+)
 * so non-US rows (stateId=NULL) still dedupe by name within a country.
 *
 * NOTE: drizzle-kit 0.31 introspection doesn't round-trip the NULLS NOT
 * DISTINCT flag through pg_constraint, so `db:push` will keep prompting
 * "add city_country_state_name_unique? truncate?" on every run. Answer
 * N — the constraint already exists in the DB. Production deploys via
 * `db:migrate` (not push) don't surface the prompt.
 */
export const city = pgTable(
  "city",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    countryId: text("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "cascade" }),
    stateId: text("state_id").references(() => state.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
  },
  (t) => [
    unique("city_country_state_name_unique")
      .on(t.countryId, t.stateId, t.name)
      .nullsNotDistinct(),
    index("city_country_state_idx").on(t.countryId, t.stateId),
    index("city_name_idx").on(t.name),
  ]
);

/**
 * Postal-code centroids sourced from GeoNames (allCountries.zip). Every zip
 * belongs to a city — reach state/country via the chain. ZIPs without a
 * resolvable city in postal data are logged and skipped at seed time
 * (rare: military APO/FPO, single-org unique ZIPs).
 */
export const zip = pgTable(
  "zip",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cityId: text("city_id")
      .notNull()
      .references(() => city.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
  },
  (t) => [
    uniqueIndex("zip_city_code_unique").on(t.cityId, t.code),
    index("zip_code_idx").on(t.code),
  ]
);
