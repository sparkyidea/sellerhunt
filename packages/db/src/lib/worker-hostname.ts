/**
 * Worker-hostname convention shared by the scan fleet and the admin UI.
 *
 * A scan box selects its persona by exact `mobile_profile.assigned_worker`
 * match against its own hostname as the `boxinfo` sidecar reports it
 * (`w-00001-orc-e2cpu1ram1-sparkyideainc`). See
 * `MobileProfileTokenManager.loadForThisBox` in
 * `apps/trigger-scan/src/utils/mobile-profile-manager.ts`. An unassigned
 * profile is never selected by any box.
 *
 * The admin UI validates what an operator types against
 * `WORKER_HOSTNAME_PATTERN`, so a stray space or dot cannot create an
 * assignment no box will ever match.
 */

/**
 * RFC 1123 hostname label: lowercase letters, digits, hyphens; 1–63 chars; no
 * edge hyphen. Lowercase only, deliberately: `loadForWorker` compares
 * `assigned_worker` with the sidecar's hostname by plain SQL equality, so an
 * uppercase value would be stored and never matched.
 */
export const WORKER_HOSTNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** True when `value` is a hostname a box could report. */
export function isWorkerHostname(value: string | null | undefined): boolean {
  return typeof value === "string" && WORKER_HOSTNAME_PATTERN.test(value);
}
