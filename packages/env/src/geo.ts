import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const geoEnvSchema = {
  /**
   * Google Maps Platform API key. Single key authorizes Geocoding API
   * and Places API (New). Restrict in Cloud Console to those APIs and
   * to the IPs of services that consume it (Trigger workers, tRPC server).
   */
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  /**
   * Rollo iOS-app API key, captured from the Rollo app. Authorizes
   * the legacy Google Places autocomplete + details endpoints via
   * the `X-Ios-Bundle-Identifier: com.rollo.app` header. Rotates
   * when Rollo ships a new iOS build — recapture if you start
   * seeing `REQUEST_DENIED` from the rollo adapter.
   */
  ROLLO_API_KEY: z.string().min(1),
};

export const env = createEnv({
  server: geoEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
