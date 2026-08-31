import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const trackingEnvSchema = {
  /**
   * Package Tracker iOS app Bearer token. Rides as
   * `Authorization: Bearer <token>` against the Ship24 mobile endpoint
   * (`https://api.ship24.com/public/v1/trackers/track`). Rotates when
   * the iOS app re-mints — recapture if the poll cron starts surfacing
   * 401s from package-tracker.
   */
  PACKAGE_TRACKER_CREDENTIAL: z.string().min(1),
};

export const env = createEnv({
  server: trackingEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
