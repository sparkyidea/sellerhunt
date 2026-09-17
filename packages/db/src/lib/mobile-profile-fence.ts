import { and, eq, type SQL } from "drizzle-orm";
import { mobileProfile } from "../schema/mobile-profile";

/**
 * WHERE clause for every scan-worker write to `mobile_profile`.
 *
 * The worker loads a row once per run (`MobileProfileTokenManager`) and keeps
 * credentials, tokens and failure bookkeeping in memory. Admin mutations that
 * invalidate that view bump `mobile_profile.revision`; a worker write that
 * still carries the old revision matches zero rows and the manager throws
 * `StaleMobileProfileError` instead of overwriting the admin's change.
 *
 * Exported from the db package so the tRPC router's integration test can run
 * the exact statement the worker runs.
 */
export function fencedProfileWhere(id: number, revision: number): SQL {
  const clause = and(
    eq(mobileProfile.id, id),
    eq(mobileProfile.revision, revision)
  );
  if (!clause) {
    throw new Error("fencedProfileWhere: drizzle returned no clause");
  }
  return clause;
}
