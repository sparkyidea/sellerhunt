import type { Tracking } from "../../../types";
import { PackageTrackerError } from "../errors";
import { packageTrackerFetch } from "../http";
import type { PackageTrackerTrackResponse } from "../raw-types";
import { mapTracking } from "./mapper/map-tracking";

export interface GetTrackingInput {
  credential: string;
  trackingNumber: string;
}

/**
 * POST /public/v1/trackers/track
 *
 * The endpoint accepts one tracking number and returns a `data.trackings[]`
 * array. We pass a single tracking number and read the first entry.
 *
 * If the response is empty (Ship24 didn't recognize the number) we throw
 * `PackageTrackerError` with status 404 so callers can distinguish from
 * transport failures.
 */
export async function getTracking(input: GetTrackingInput): Promise<Tracking> {
  const response = await packageTrackerFetch<PackageTrackerTrackResponse>({
    path: "/public/v1/trackers/track",
    credential: input.credential,
    body: { trackingNumber: input.trackingNumber },
  });

  const tracking = response.data.trackings[0];
  if (!tracking) {
    throw new PackageTrackerError({
      httpStatus: 404,
      path: "/public/v1/trackers/track",
      upstreamMessage: `No tracking found for ${input.trackingNumber}`,
    });
  }

  return mapTracking(tracking, input.trackingNumber);
}
