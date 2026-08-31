import type { TrackingClient } from "./adapters/base";
import { PackageTrackerTrackingClient } from "./adapters/package-tracker/client";
import type { ProviderConfig } from "./types";

/**
 * Create a unified tracking client for the requested provider.
 *
 * Caller provides all credentials — no environment variables are read here.
 * Types live at `@dashseller/shipment-tracking/types`.
 *
 * @example
 * ```typescript
 * // Package Tracker — needs the Bearer token from the Package Tracker iOS app
 * const client = createTrackingClient({
 *   provider: "package-tracker",
 *   credential,
 * });
 *
 * const tracking = await client.track({ trackingNumber: "9402266365018300668067" });
 * ```
 */
export function createTrackingClient(config: ProviderConfig): TrackingClient {
  switch (config.provider) {
    case "package-tracker":
      return new PackageTrackerTrackingClient(config);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unsupported tracking provider: ${String(exhaustive)}`);
    }
  }
}
