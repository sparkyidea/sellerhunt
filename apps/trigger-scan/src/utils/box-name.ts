// THIS box's name, served by the `boxinfo` sidecar (busybox httpd on the `supervisor`
// docker network). The sidecar publishes the host's /etc/hostname, which == the
// Tailscale node name (provision sets TS_HOSTNAME="$(hostname)").
//
// This is the ONLY non-hack way to get the box identity into task code: the supervisor
// injects TRIGGER_WORKER_INSTANCE_NAME into the runner CONTAINER, but the runner rebuilds
// the task subprocess env from a fixed whitelist, so NO env var reaches run(). A plain
// network fetch to the sidecar bypasses that. See deploy/worker/*/docker-compose.yml.

/**
 * The box this run is executing on — the `boxinfo` sidecar's hostname (== the host
 * /etc/hostname == the Tailscale node name). Performs a fresh lookup on every call
 * because a checkpointed task may resume on another worker. Never throws; callers
 * selecting worker-bound resources must treat `null` as an error and must not reuse
 * a previously resolved identity.
 */
export function getBoxName(timeoutMs = 2000): Promise<string | null> {
  return fetchBoxName(timeoutMs);
}

// The full hostname (e.g. `w-00001-orc-e2cpu1ram1-sparkyideainc`) is the
// persona assignment key: `mobile_profile.assigned_worker` must equal it
// exactly, and only the box's own claim ever writes it.

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
    // Identity cannot be established; worker-bound resource selection must stop.
    return null;
  }
}
