/**
 * Direct Shippo Tracks API call. Dumps the raw JSON response so we can
 * see what fields Shippo returns and decide how to map them to our
 * normalized `Tracking` shape.
 *
 * Docs: https://docs.goshippo.com/shippoapi/public-api/#tag/Tracks
 *
 * Usage:
 *   bun run packages/shipment-tracking/sandbox/shippo/direct-api/track.ts <carrier> <tracking_number>
 *
 * Test-mode examples (carrier "shippo"):
 *   ... shippo SHIPPO_PRE_TRANSIT
 *   ... shippo SHIPPO_TRANSIT
 *   ... shippo SHIPPO_DELIVERED
 *   ... shippo SHIPPO_RETURNED
 *   ... shippo SHIPPO_FAILURE
 *   ... shippo SHIPPO_UNKNOWN
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const carrier = process.argv[2];
const trackingNumber = process.argv[3];
if (!(carrier && trackingNumber)) {
  console.error(
    "Usage: bun run packages/shipment-tracking/sandbox/shippo/direct-api/track.ts <carrier> <tracking_number>"
  );
  console.error("Test example: ... shippo SHIPPO_TRANSIT");
  process.exit(1);
}

const config = getConfig();
const url = `${config.baseUrl}/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`;

console.log(`GET ${url}\n`);

const response = await fetch(url, {
  headers: {
    accept: "application/json",
    authorization: `ShippoToken ${config.token}`,
  },
});

const text = await response.text();
const outputFile = fileURLToPath(
  new URL(`./output/track-${carrier}-${trackingNumber}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, text);

console.log(`HTTP ${response.status} ${response.statusText}`);
console.log(`Wrote ${outputFile}\n`);

if (!response.ok) {
  console.error(text.slice(0, 500));
  process.exit(1);
}

interface ShippoTrackingStatus {
  location?: {
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
  status?: string;
  status_date?: string;
  status_details?: string;
  substatus?: { code?: string; text?: string } | null;
}

interface ShippoTrack {
  address_from?: unknown;
  address_to?: unknown;
  carrier?: string;
  eta?: string | null;
  original_eta?: string | null;
  servicelevel?: { token?: string; name?: string } | null;
  tracking_history?: ShippoTrackingStatus[];
  tracking_number?: string;
  tracking_status?: ShippoTrackingStatus | null;
}

const parsed = JSON.parse(text) as ShippoTrack;
const status = parsed.tracking_status;

console.log(`carrier:        ${parsed.carrier ?? "—"}`);
console.log(`tracking#:      ${parsed.tracking_number ?? "—"}`);
console.log(`status:         ${status?.status ?? "—"}`);
console.log(
  `substatus:      ${status?.substatus?.code ?? status?.substatus?.text ?? "—"}`
);
console.log(`statusDate:     ${status?.status_date ?? "—"}`);
console.log(`statusDetails:  ${status?.status_details ?? "—"}`);
console.log(`eta:            ${parsed.eta ?? "—"}`);
console.log(`originalEta:    ${parsed.original_eta ?? "—"}`);
console.log(`history events: ${parsed.tracking_history?.length ?? 0}`);

if (status?.location) {
  const loc = status.location;
  console.log(
    `latest location: ${loc.city ?? "—"}, ${loc.state ?? "—"} ${loc.zip ?? ""} ${loc.country ?? ""}`.trim()
  );
}

process.exit(0);
