import type {
  PackageTrackerConfig,
  Tracking,
  TrackingInput,
  TrackingProvider,
} from "../../types";
import type { TrackingClient } from "../base";
import { getTracking } from "./api/get-tracking";

/**
 * Package Tracker / Ship24 mobile tracking adapter — calls
 * `https://api.ship24.com/public/v1/trackers/track` with the iOS app's
 * Bearer token.
 *
 * `TrackingInput.carrierHint` is ignored: Ship24 auto-detects the courier
 * from the tracking number across its full courier set.
 */
export class PackageTrackerTrackingClient implements TrackingClient {
  private readonly credential: string;

  constructor(config: PackageTrackerConfig) {
    this.credential = config.credential;
  }

  getProviderId(): TrackingProvider {
    return "package-tracker";
  }

  async track(input: TrackingInput): Promise<Tracking> {
    return await getTracking({
      credential: this.credential,
      trackingNumber: input.trackingNumber,
    });
  }
}
