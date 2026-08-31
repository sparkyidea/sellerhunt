// THIS box's name, served by the `boxinfo` sidecar (busybox httpd on the `supervisor`
// docker network). The sidecar publishes the host's /etc/hostname, which == the
// Tailscale node name (provision sets TS_HOSTNAME="$(hostname)").
//
// This is the ONLY non-hack way to get the box identity into task code: the supervisor
// injects TRIGGER_WORKER_INSTANCE_NAME into the runner CONTAINER, but the runner rebuilds
// the task subprocess env from a fixed whitelist, so NO env var reaches run(). A plain
// network fetch to the sidecar bypasses that. See deploy/worker/*/docker-compose.yml.

let cached: Promise<string | null> | null = null;

/**
 * The box this run is executing on — the `boxinfo` sidecar's hostname (== the host
 * /etc/hostname == the Tailscale node name). Memoised once per runner process (shared
 * across every task in the process); never throws — returns null if the sidecar is
 * unreachable, so callers can fall back.
 */
export function getBoxName(timeoutMs = 2000): Promise<string | null> {
  cached ??= fetchBoxName(timeoutMs);
  return cached;
}

/**
 * The persona label embedded in a box hostname. Box hostnames are
 * `<label>-<role>-<specs>-<org>` (e.g. `w-00001-orc-e2cpu1ram1-sparkyideainc`);
 * the persona label is just the leading `w-NNNNN` prefix, which matches the
 * seeded `mobile_profile.label` and the `w-NNNNN.json` capture filenames.
 *
 * Returns null when the hostname carries no recognizable worker prefix (e.g. a
 * box that isn't part of the scan fleet). Adjust the pattern here if the label
 * convention ever changes — this is the one place that knows it.
 */
const WORKER_LABEL_RE = /^w-\d+/;

export function parseWorkerLabel(boxName: string): string | null {
  return boxName.match(WORKER_LABEL_RE)?.[0] ?? null;
}

async function fetchBoxName(timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch("http://boxinfo:5678/name", {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return null;
    }
    const name = (await res.text()).trim();
    return name || null;
  } catch {
    // sidecar not running / not reachable on this network — caller falls back
    return null;
  }
}
