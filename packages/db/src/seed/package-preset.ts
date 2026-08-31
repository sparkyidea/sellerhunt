/**
 * Seed the `package_preset` table with carrier-provided packaging templates.
 *
 * Contains FedEx and USPS standard package dimensions so users start
 * with ready-to-use presets instead of entering dimensions manually.
 *
 * Global presets (carrier-predefined) are inserted with organizationId = null,
 * making them visible to all users.
 *
 * Usage:
 *   bun run packages/db/src/seed/package-preset.ts
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { packagePreset } from "../schema/shipment";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, "../../../../apps/api/.env"),
});

const db = drizzle(process.env.DATABASE_URL || "");

interface PackagePresetData {
  height: string;
  length: string;
  name: string;
  providerTemplate: string;
  width: string;
}

/**
 * Carrier-provided packaging templates with dimensions in inches.
 * Dimensions are ordered as length × width × height.
 */
export const CARRIER_PACKAGE_PRESETS: PackagePresetData[] = [
  // ── FedEx ──────────────────────────────────────────────────
  {
    name: "FedEx Envelope",
    length: "12.5",
    width: "9.5",
    height: "0.5",
    providerTemplate: "FEDEX_ENVELOPE",
  },
  {
    name: "FedEx Envelope (Padded)",
    length: "11.25",
    width: "9.75",
    height: "0.5",
    providerTemplate: "FEDEX_PADDED_ENVELOPE",
  },
  {
    name: "FedEx Large Envelope",
    length: "15.5",
    width: "9.5",
    height: "0.5",
    providerTemplate: "FEDEX_LARGE_ENVELOPE",
  },
  {
    name: "FedEx Padded Pak",
    length: "14.75",
    width: "11.75",
    height: "0.5",
    providerTemplate: "FEDEX_PADDED_PAK",
  },
  {
    name: "FedEx Large Pak",
    length: "15.5",
    width: "12",
    height: "0.5",
    providerTemplate: "FEDEX_LARGE_PAK",
  },
  {
    name: "FedEx Small Pak",
    length: "12.75",
    width: "10.25",
    height: "0.5",
    providerTemplate: "FEDEX_SMALL_PAK",
  },
  {
    name: "FedEx Reusable Sturdy Pak",
    length: "14.5",
    width: "10",
    height: "0.5",
    providerTemplate: "FEDEX_REUSABLE_STURDY_PAK",
  },
  {
    name: "FedEx Tube",
    length: "38",
    width: "6",
    height: "6",
    providerTemplate: "FEDEX_TUBE",
  },
  {
    name: "FedEx Small Box (S1)",
    length: "12.38",
    width: "10.88",
    height: "1.5",
    providerTemplate: "FEDEX_SMALL_BOX_S1",
  },
  {
    name: "FedEx Small Box (S2)",
    length: "11.25",
    width: "8.75",
    height: "2.63",
    providerTemplate: "FEDEX_SMALL_BOX_S2",
  },
  {
    name: "FedEx Medium Box (M1)",
    length: "13.25",
    width: "11.5",
    height: "2.38",
    providerTemplate: "FEDEX_MEDIUM_BOX_M1",
  },
  {
    name: "FedEx Medium Box (M2)",
    length: "11.25",
    width: "8.75",
    height: "4.38",
    providerTemplate: "FEDEX_MEDIUM_BOX_M2",
  },
  {
    name: "FedEx Large Box (L1)",
    length: "17.5",
    width: "12.38",
    height: "3",
    providerTemplate: "FEDEX_LARGE_BOX_L1",
  },
  {
    name: "FedEx Large Box (L2)",
    length: "11.25",
    width: "8.75",
    height: "7.75",
    providerTemplate: "FEDEX_LARGE_BOX_L2",
  },
  {
    name: "FedEx Extra Large Box (X1)",
    length: "11.88",
    width: "11",
    height: "10.75",
    providerTemplate: "FEDEX_EXTRA_LARGE_BOX_X1",
  },
  {
    name: "FedEx Extra Large Box (X2)",
    length: "15.75",
    width: "14.13",
    height: "6",
    providerTemplate: "FEDEX_EXTRA_LARGE_BOX_X2",
  },

  // ── USPS ───────────────────────────────────────────────────
  {
    name: "USPS Flat Rate Cardboard Envelope",
    length: "12.5",
    width: "9.5",
    height: "0.8",
    providerTemplate: "USPS_FLAT_RATE_CARDBOARD_ENVELOPE",
  },
  {
    name: "USPS Flat Rate Envelope",
    length: "12.5",
    width: "9.5",
    height: "0.8",
    providerTemplate: "USPS_FLAT_RATE_ENVELOPE",
  },
  {
    name: "USPS Flat Rate Gift Card Envelope",
    length: "10",
    width: "7",
    height: "0.7",
    providerTemplate: "USPS_FLAT_RATE_GIFT_CARD_ENVELOPE",
  },
  {
    name: "USPS Flat Rate Legal Envelope",
    length: "15",
    width: "9.5",
    height: "0.8",
    providerTemplate: "USPS_FLAT_RATE_LEGAL_ENVELOPE",
  },
  {
    name: "USPS Flat Rate Padded Envelope",
    length: "12.5",
    width: "9.5",
    height: "1",
    providerTemplate: "USPS_FLAT_RATE_PADDED_ENVELOPE",
  },
  {
    name: "USPS Flat Rate Window Envelope",
    length: "10",
    width: "5",
    height: "0.8",
    providerTemplate: "USPS_FLAT_RATE_WINDOW_ENVELOPE",
  },
  {
    name: "USPS Large Flat Rate Board Game Box",
    length: "24",
    width: "11.8",
    height: "3.1",
    providerTemplate: "USPS_LARGE_FLAT_RATE_BOARD_GAME_BOX",
  },
  {
    name: "USPS Large Flat Rate Box",
    length: "12.2",
    width: "12",
    height: "6",
    providerTemplate: "USPS_LARGE_FLAT_RATE_BOX",
  },
  {
    name: "USPS APO/FPO/DPO Large Flat Rate Box",
    length: "12.2",
    width: "12",
    height: "6",
    providerTemplate: "USPS_APO_FPO_DPO_LARGE_FLAT_RATE_BOX",
  },
  {
    name: "USPS Flat Rate Large Video Box (Intl only)",
    length: "9.6",
    width: "6.4",
    height: "2.2",
    providerTemplate: "USPS_FLAT_RATE_LARGE_VIDEO_BOX",
  },
  {
    name: "USPS Medium Flat Rate Box 1",
    length: "11.2",
    width: "8.7",
    height: "6",
    providerTemplate: "USPS_MEDIUM_FLAT_RATE_BOX_1",
  },
  {
    name: "USPS Medium Flat Rate Box 2",
    length: "14",
    width: "12",
    height: "3.5",
    providerTemplate: "USPS_MEDIUM_FLAT_RATE_BOX_2",
  },
  {
    name: "USPS Regional Rate Box A1",
    length: "10.1",
    width: "7.1",
    height: "5",
    providerTemplate: "USPS_REGIONAL_RATE_BOX_A1",
  },
  {
    name: "USPS Regional Rate Box A2",
    length: "13",
    width: "11",
    height: "2.5",
    providerTemplate: "USPS_REGIONAL_RATE_BOX_A2",
  },
  {
    name: "USPS Regional Rate Box B1",
    length: "12.2",
    width: "10.5",
    height: "5.5",
    providerTemplate: "USPS_REGIONAL_RATE_BOX_B1",
  },
  {
    name: "USPS Regional Rate Box B2",
    length: "16.2",
    width: "14.5",
    height: "3",
    providerTemplate: "USPS_REGIONAL_RATE_BOX_B2",
  },
  {
    name: "USPS Small Flat Rate Box",
    length: "8.6",
    width: "5.4",
    height: "1.7",
    providerTemplate: "USPS_SMALL_FLAT_RATE_BOX",
  },
  {
    name: "USPS Small Flat Rate Envelope",
    length: "10",
    width: "6",
    height: "0.8",
    providerTemplate: "USPS_SMALL_FLAT_RATE_ENVELOPE",
  },
  {
    name: "USPS Irregular Parcel",
    length: "34",
    width: "17",
    height: "17",
    providerTemplate: "USPS_IRREGULAR_PARCEL",
  },
  {
    name: "USPS Soft Pack Padded Envelope",
    length: "12.5",
    width: "9.5",
    height: "1",
    providerTemplate: "USPS_SOFT_PACK_PADDED_ENVELOPE",
  },
];

async function seedPackagePresets() {
  console.log(
    `Seeding ${CARRIER_PACKAGE_PRESETS.length} global package presets...`
  );

  try {
    const values = CARRIER_PACKAGE_PRESETS.map((preset) => ({
      name: preset.name,
      length: preset.length,
      width: preset.width,
      height: preset.height,
      providerTemplate: preset.providerTemplate,
    }));

    await db.delete(packagePreset).where(isNull(packagePreset.organizationId));
    await db.insert(packagePreset).values(values);

    console.log(
      `✅ ${CARRIER_PACKAGE_PRESETS.length} global package presets seeded successfully`
    );
  } catch (error) {
    console.error("❌ Error seeding package presets:", error);
    process.exit(1);
  }

  process.exit(0);
}

seedPackagePresets();
