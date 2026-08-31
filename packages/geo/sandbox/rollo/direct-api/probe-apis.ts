/**
 * Direct API probe — discovers which Google Maps Platform APIs
 * Rollo's iOS-app key authorizes, by hitting one well-formed
 * request per API surface and inspecting the response status.
 *
 * All probes send the same `X-Ios-Bundle-Identifier: com.rollo.app`
 * header the autocomplete adapter uses. Each probe uses neutral,
 * well-known landmark inputs (Googleplex, SFO) so success can be
 * distinguished from "no results" without ambiguity.
 *
 * Most probes hit JSON endpoints (`maps.googleapis.com/maps/api/*`)
 * which return HTTP 200 with an in-body `status` field. Image
 * endpoints (Static Maps, Street View, Place Photo) return image
 * bytes on success and HTTP 403 with a "ApiNotActivated"-style
 * body on denial — the probe checks `content-type` for those.
 *
 * Usage:
 *   bun run packages/geo/sandbox/rollo/direct-api/probe-apis.ts
 */
import { resolve } from "node:path";
import dotenv from "dotenv";

const sandboxEnvPath = resolve(import.meta.dirname, "../../.env");
dotenv.config({ path: sandboxEnvPath });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var: ${name}. Check ${sandboxEnvPath}`);
    process.exit(1);
  }
  return value;
}

const apiKey = requireEnv("ROLLO_API_KEY");

const HEADERS = { "X-Ios-Bundle-Identifier": "com.rollo.app" };

type ProbeOutcome =
  | { kind: "ok"; detail: string }
  | { kind: "denied"; detail: string }
  | { kind: "other"; detail: string };

interface Probe {
  /** Display name for the table row. */
  name: string;
  /** What the API does — short hint. */
  purpose: string;
  /** Probe function — issues one request and classifies the result. */
  run: () => Promise<ProbeOutcome>;
}

async function probeJsonApi(
  endpoint: string,
  query: Record<string, string>
): Promise<ProbeOutcome> {
  const search = new URLSearchParams({ ...query, key: apiKey });
  const url = `${endpoint}?${search.toString()}`;
  const response = await fetch(url, { headers: HEADERS });
  const rawBody = await response.text();

  if (!response.ok) {
    return {
      kind: "other",
      detail: `HTTP ${response.status} — ${rawBody.slice(0, 120)}`,
    };
  }

  let parsed: { status?: string; error_message?: string };
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    return { kind: "other", detail: `non-JSON body: ${rawBody.slice(0, 120)}` };
  }

  if (parsed.status === "OK" || parsed.status === "ZERO_RESULTS") {
    return { kind: "ok", detail: parsed.status };
  }
  if (parsed.status === "REQUEST_DENIED") {
    return { kind: "denied", detail: parsed.error_message ?? "REQUEST_DENIED" };
  }
  return {
    kind: "other",
    detail:
      `${parsed.status ?? "unknown"} — ${parsed.error_message ?? ""}`.trim(),
  };
}

async function probeImageApi(
  endpoint: string,
  query: Record<string, string>
): Promise<ProbeOutcome> {
  const search = new URLSearchParams({ ...query, key: apiKey });
  const url = `${endpoint}?${search.toString()}`;
  const response = await fetch(url, { headers: HEADERS });
  const contentType = response.headers.get("content-type") ?? "";

  if (response.ok && contentType.startsWith("image/")) {
    return { kind: "ok", detail: `image/${contentType.split("/")[1]}` };
  }

  const body = await response.text();
  if (
    response.status === 403 ||
    body.includes("RefererNotAllowedMapError") ||
    body.includes("ApiNotActivatedMapError")
  ) {
    return { kind: "denied", detail: `HTTP ${response.status}` };
  }
  return {
    kind: "other",
    detail: `HTTP ${response.status} ${contentType} — ${body.slice(0, 120)}`,
  };
}

async function probePlacesNew(
  path: string,
  body: unknown,
  fieldMask: string
): Promise<ProbeOutcome> {
  const url = `https://places.googleapis.com/v1${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  const rawBody = await response.text();
  if (response.ok) {
    return { kind: "ok", detail: `HTTP ${response.status}` };
  }
  if (response.status === 403) {
    return { kind: "denied", detail: rawBody.slice(0, 200) };
  }
  return {
    kind: "other",
    detail: `HTTP ${response.status} — ${rawBody.slice(0, 200)}`,
  };
}

// Well-known landmarks used as probe inputs.
const GOOGLEPLEX = { lat: 37.422_057_8, lng: -122.084_089_7 };
const SFO = "37.6213,-122.3790";
const GOOGLEPLEX_PLACE_ID = "ChIJj61dQgK6j4AR4GeTYWZsKWw";

const PROBES: Probe[] = [
  {
    name: "Geocoding (forward)",
    purpose: "address → lat/lng",
    run: () =>
      probeJsonApi("https://maps.googleapis.com/maps/api/geocode/json", {
        address: "Googleplex, Mountain View, CA",
      }),
  },
  {
    name: "Geocoding (reverse)",
    purpose: "lat/lng → address",
    run: () =>
      probeJsonApi("https://maps.googleapis.com/maps/api/geocode/json", {
        latlng: `${GOOGLEPLEX.lat},${GOOGLEPLEX.lng}`,
      }),
  },
  {
    name: "Places Autocomplete (legacy)",
    purpose: "typeahead suggestions",
    run: () =>
      probeJsonApi(
        "https://maps.googleapis.com/maps/api/place/autocomplete/json",
        { input: "googleplex", types: "address" }
      ),
  },
  {
    name: "Places Details (legacy)",
    purpose: "placeId → full place",
    run: () =>
      probeJsonApi("https://maps.googleapis.com/maps/api/place/details/json", {
        placeid: GOOGLEPLEX_PLACE_ID,
        fields: "place_id,formatted_address",
      }),
  },
  {
    name: "Places Text Search (legacy)",
    purpose: "free-text place lookup",
    run: () =>
      probeJsonApi(
        "https://maps.googleapis.com/maps/api/place/textsearch/json",
        { query: "googleplex mountain view" }
      ),
  },
  {
    name: "Places Nearby Search (legacy)",
    purpose: "places near a point",
    run: () =>
      probeJsonApi(
        "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
        {
          location: `${GOOGLEPLEX.lat},${GOOGLEPLEX.lng}`,
          radius: "500",
          type: "restaurant",
        }
      ),
  },
  {
    name: "Places Find From Text (legacy)",
    purpose: "match free text to one place",
    run: () =>
      probeJsonApi(
        "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
        {
          input: "googleplex",
          inputtype: "textquery",
          fields: "place_id",
        }
      ),
  },
  {
    name: "Places (New) Autocomplete",
    purpose: "modern Places — typeahead",
    run: () =>
      probePlacesNew(
        "/places:autocomplete",
        {
          input: "googleplex",
          includedRegionCodes: ["us"],
          languageCode: "en",
        },
        "suggestions.placePrediction.placeId"
      ),
  },
  {
    name: "Places (New) Details",
    purpose: "modern Places — placeId → place",
    run: async () => {
      const url = `https://places.googleapis.com/v1/places/${GOOGLEPLEX_PLACE_ID}?languageCode=en`;
      const response = await fetch(url, {
        headers: {
          ...HEADERS,
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,formattedAddress",
        },
      });
      const body = await response.text();
      if (response.ok) {
        return { kind: "ok", detail: `HTTP ${response.status}` };
      }
      if (response.status === 403) {
        return { kind: "denied", detail: body.slice(0, 200) };
      }
      return {
        kind: "other",
        detail: `HTTP ${response.status} — ${body.slice(0, 200)}`,
      };
    },
  },
  {
    name: "Distance Matrix",
    purpose: "many-to-many distance + ETA",
    run: () =>
      probeJsonApi("https://maps.googleapis.com/maps/api/distancematrix/json", {
        origins: "Googleplex, Mountain View, CA",
        destinations: SFO,
      }),
  },
  {
    name: "Directions",
    purpose: "route between two points",
    run: () =>
      probeJsonApi("https://maps.googleapis.com/maps/api/directions/json", {
        origin: "Googleplex, Mountain View, CA",
        destination: SFO,
      }),
  },
  {
    name: "Time Zone",
    purpose: "lat/lng → IANA tz",
    run: () =>
      probeJsonApi("https://maps.googleapis.com/maps/api/timezone/json", {
        location: `${GOOGLEPLEX.lat},${GOOGLEPLEX.lng}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
      }),
  },
  {
    name: "Elevation",
    purpose: "lat/lng → meters above sea",
    run: () =>
      probeJsonApi("https://maps.googleapis.com/maps/api/elevation/json", {
        locations: `${GOOGLEPLEX.lat},${GOOGLEPLEX.lng}`,
      }),
  },
  {
    name: "Roads — Snap to Roads",
    purpose: "snap GPS trace to road graph",
    run: () =>
      probeJsonApi("https://roads.googleapis.com/v1/snapToRoads", {
        path: `${GOOGLEPLEX.lat},${GOOGLEPLEX.lng}`,
      }),
  },
  {
    name: "Static Maps (image)",
    purpose: "map thumbnail PNG/JPG",
    run: () =>
      probeImageApi("https://maps.googleapis.com/maps/api/staticmap", {
        center: `${GOOGLEPLEX.lat},${GOOGLEPLEX.lng}`,
        zoom: "14",
        size: "200x200",
      }),
  },
  {
    name: "Street View Static (image)",
    purpose: "street view thumbnail",
    run: () =>
      probeImageApi("https://maps.googleapis.com/maps/api/streetview", {
        location: `${GOOGLEPLEX.lat},${GOOGLEPLEX.lng}`,
        size: "200x200",
      }),
  },
];

function pad(value: string, width: number): string {
  return value.length >= width
    ? value
    : value + " ".repeat(width - value.length);
}

const NAME_WIDTH = 32;
const PURPOSE_WIDTH = 32;
const STATUS_WIDTH = 8;

console.log(
  `Probing ${PROBES.length} Google Maps APIs with Rollo credentials...\n`
);
console.log(
  `${pad("API", NAME_WIDTH)}  ${pad("Purpose", PURPOSE_WIDTH)}  ${pad("Status", STATUS_WIDTH)}  Detail`
);
console.log("─".repeat(NAME_WIDTH + PURPOSE_WIDTH + STATUS_WIDTH + 16));

const summary: Record<ProbeOutcome["kind"], string[]> = {
  ok: [],
  denied: [],
  other: [],
};

for (const probe of PROBES) {
  let outcome: ProbeOutcome;
  try {
    outcome = await probe.run();
  } catch (error) {
    outcome = {
      kind: "other",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const markerByKind: Record<ProbeOutcome["kind"], string> = {
    ok: "✓ OK",
    denied: "✗ DENY",
    other: "? ?",
  };
  const marker = markerByKind[outcome.kind];
  console.log(
    `${pad(probe.name, NAME_WIDTH)}  ${pad(probe.purpose, PURPOSE_WIDTH)}  ${pad(marker, STATUS_WIDTH)}  ${outcome.detail}`
  );
  summary[outcome.kind].push(probe.name);
}

console.log("");
console.log(
  `✓ Authorized (${summary.ok.length}):  ${summary.ok.join(", ") || "—"}`
);
console.log(
  `✗ Denied (${summary.denied.length}):     ${summary.denied.join(", ") || "—"}`
);
if (summary.other.length > 0) {
  console.log(
    `? Inconclusive (${summary.other.length}): ${summary.other.join(", ")}`
  );
}
process.exit(0);
