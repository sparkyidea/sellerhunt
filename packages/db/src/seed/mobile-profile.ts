/**
 * Seed `mobile_profile` rows from captured iOS device personas.
 *
 * Each persona is one JSON file under
 * `packages/db/src/seed/tmp/<app>/profiles/`; this script loads every
 * file across all apps, encrypts the credentials blob, and inserts it into the
 * `mobile_profile` pool. The directory's app (`ebay`, `shop`) becomes `app`;
 * the database numbers each row (`id`). The filename is only used in the
 * log. Rows land unassigned — a worker is attached from the admin UI.
 *
 * `tmp/` is git-ignored (only its `.gitignore` is tracked): duplicate the
 * captured personas from `packages/marketplace-scan/sandbox/<app>/profiles/`
 * into `tmp/<app>/profiles/` before seeding — the contents never get committed.
 *
 * Persona sources (single source of truth per app):
 *   - eBay: `tmp/ebay/profiles/*.json` — `EbayHmacCredentials`
 *           (HMAC signing key + device identifiers).
 *   - shop: `tmp/shop/profiles/*.json` — `ShopRefreshTokenCredentials`
 *           (device-identity headers; the real secret is the refresh token
 *           shop.app mints, stored separately on the row).
 *   The blob carries no `app` discriminator — the directory determines it.
 *   `*.example.json` placeholders are skipped.
 *
 * Config sources for DATABASE_URL / ENCRYPTION_SECRET (first match wins):
 *   1. `apps/api/.env`
 *   2. `packages/marketplace-scan/sandbox/.env`
 *   3. process.env (also wins for ad-hoc overrides)
 *
 * The seed only inserts: a row carries nothing that identifies its source
 * file, so re-running adds every file again. Rotate a persona capture from
 * the admin UI ("Replace credentials") instead.
 *
 * Run:
 *   bun run packages/db/src/seed/mobile-profile.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { encryptSecret } from "../lib/secret-crypto";
import { mobileProfile } from "../schema/mobile-profile";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, "../../../../apps/api/.env"),
});
dotenv.config({
  path: resolve(__dirname, "../../../marketplace-scan/sandbox/.env"),
});

const db = drizzle(process.env.DATABASE_URL || "");

const PROFILES_ROOT = resolve(__dirname, "tmp");
const JSON_EXT = /\.json$/;

type ProfileApp = "ebay" | "shop";

interface AppConfig {
  /** Directory holding this app's per-file personas. */
  dir: string;
  /** Fields every persona file must carry as non-empty strings. */
  requiredFields: readonly string[];
}

const APP_CONFIG: Record<ProfileApp, AppConfig> = {
  ebay: {
    dir: resolve(PROFILES_ROOT, "ebay/profiles"),
    requiredFields: [
      "clientId",
      "hmacKey",
      "device4pp",
      "idfa",
      "idfv",
      "deviceId",
      "guid",
    ],
  },
  shop: {
    dir: resolve(PROFILES_ROOT, "shop/profiles"),
    requiredFields: ["deviceIdHw", "deviceName", "deviceId"],
  },
};

interface ProfileSeed {
  app: ProfileApp;
  /** Filename stem, for the log only. */
  file: string;
  /** Raw JSON text of the credentials blob, read from a profile file. */
  raw: string;
}

/**
 * Build the persona work-list across every app's profiles directory
 * `*.example.json` placeholders are skipped.
 */
function collectProfiles(): ProfileSeed[] {
  const seeds: ProfileSeed[] = [];
  for (const app of Object.keys(APP_CONFIG) as ProfileApp[]) {
    const { dir } = APP_CONFIG[app];
    if (!existsSync(dir)) {
      continue;
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".example.json"))
      .sort();
    for (const file of files) {
      seeds.push({
        app,
        file: file.replace(JSON_EXT, ""),
        raw: readFileSync(resolve(dir, file), "utf8"),
      });
    }
  }
  return seeds;
}

/**
 * Validate that every required field is a non-empty string and return a clean
 * object holding only those fields (drops anything extra before encrypt). The
 * stored blob carries no `app` discriminator — the directory determines it.
 */
function parseCredentials(
  raw: string,
  requiredFields: readonly string[]
): Record<string, string> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const credentials: Record<string, string> = {};
  for (const field of requiredFields) {
    const value = parsed[field];
    if (typeof value !== "string" || value === "") {
      throw new Error(`missing or non-string field: ${field}`);
    }
    credentials[field] = value;
  }
  return credentials;
}

async function seedMobileProfiles(): Promise<void> {
  const encryptionKey = process.env.ENCRYPTION_SECRET;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_SECRET not set");
  }

  const profiles = collectProfiles();
  if (profiles.length === 0) {
    console.warn(
      "No personas found. Add capture files under " +
        "packages/db/src/seed/tmp/<app>/profiles/ (duplicate them from packages/marketplace-scan/sandbox/<app>/profiles/)."
    );
    process.exit(0);
  }

  console.log(`Seeding ${profiles.length} mobile profile(s)...`);
  let inserted = 0;
  let skipped = 0;

  for (const seed of profiles) {
    let credentials: Record<string, string>;
    try {
      credentials = parseCredentials(
        seed.raw,
        APP_CONFIG[seed.app].requiredFields
      );
    } catch (err) {
      console.warn(
        `  skip ${seed.app}/${seed.file}: invalid persona — ${err instanceof Error ? err.message : String(err)}`
      );
      skipped++;
      continue;
    }

    const encryptedCredentials = await encryptSecret(
      JSON.stringify(credentials),
      encryptionKey
    );

    const [row] = await db
      .insert(mobileProfile)
      .values({ app: seed.app, credentials: encryptedCredentials })
      .returning({ id: mobileProfile.id });
    console.log(`  insert ${seed.app}/${seed.file} as #${row?.id}`);
    inserted++;
  }

  console.log(`Done. ${inserted} inserted, ${skipped} skipped.`);
  process.exit(0);
}

try {
  await seedMobileProfiles();
} catch (error) {
  console.error("Error seeding mobile profiles:", error);
  process.exit(1);
}
