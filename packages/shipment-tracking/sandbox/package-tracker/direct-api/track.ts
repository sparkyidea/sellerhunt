/**
 * Direct Ship24 API call (mobile-app endpoint used by Package Tracker for
 * iOS). Dumps the raw JSON response so we can confirm the field shapes the
 * mapper depends on (shipment.statusMilestone, events[].statusMilestone,
 * events[].location).
 *
 * Usage:
 *   bun run packages/shipment-tracking/sandbox/package-tracker/direct-api/track.ts <tracking_number>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const trackingNumber = process.argv[2];
if (!trackingNumber) {
  console.error(
    "Usage: bun run packages/shipment-tracking/sandbox/package-tracker/direct-api/track.ts <tracking_number>"
  );
  process.exit(1);
}

const config = getConfig();
const url = "https://api.ship24.com/public/v1/trackers/track";

console.log(`POST ${url}`);
console.log(`Body: ${JSON.stringify({ trackingNumber })}\n`);

const response = await fetch(url, {
  method: "POST",
  headers: {
    accept: "application/json",
    authorization: `Bearer ${config.credential}`,
    "content-type": "application/json",
    "user-agent":
      "PackageTracker/1.1.1 (com.williamwagner.packagetracker; build:4; iOS 16.3.0) Alamofire/5.10.2",
  },
  body: JSON.stringify({ trackingNumber }),
});

const text = await response.text();
const outputFile = fileURLToPath(
  new URL(`./output/track-${trackingNumber}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, text);

console.log(`HTTP ${response.status} ${response.statusText}`);
console.log(`Wrote ${outputFile}\n`);

if (!response.ok) {
  console.error(text.slice(0, 500));
  process.exit(1);
}

interface RawTracking {
  data?: {
    trackings?: Array<{
      shipment?: {
        statusCode?: string | null;
        statusCategory?: string | null;
        statusMilestone?: string | null;
        delivery?: {
          service?: string | null;
          estimatedDeliveryDate?: string | null;
        };
      };
      events?: Array<{
        status?: string;
        datetime?: string;
        location?: string | null;
        statusMilestone?: string | null;
      }>;
    }>;
  };
}

const parsed = JSON.parse(text) as RawTracking;
const tracking = parsed.data?.trackings?.[0];
if (!tracking) {
  console.log("(empty response — no tracking found)");
  process.exit(0);
}

console.log(`statusCode:     ${tracking.shipment?.statusCode ?? "—"}`);
console.log(`statusCategory: ${tracking.shipment?.statusCategory ?? "—"}`);
console.log(`statusMilestone:${tracking.shipment?.statusMilestone ?? "—"}`);
console.log(`service:        ${tracking.shipment?.delivery?.service ?? "—"}`);
console.log(
  `estDelivery:    ${tracking.shipment?.delivery?.estimatedDeliveryDate ?? "—"}`
);
console.log(`events:         ${tracking.events?.length ?? 0}`);

const latest = tracking.events?.[0];
if (latest) {
  console.log("\nlatest event:");
  console.log(`  ${latest.datetime ?? "—"}  ${latest.statusMilestone ?? "—"}`);
  console.log(`  ${latest.status ?? "—"}  (${latest.location ?? "—"})`);
}

process.exit(0);
