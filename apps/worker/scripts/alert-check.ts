/**
 * Ops alert check — the runner behind apps/worker/OPERATIONS.md's alert
 * table. Runs the Postgres backstop queries directly (works even when the
 * worker is down) and, when WORKER_URL is set, polls /ready + /stats.
 * One aggregated message per run; STATELESS by design — an ongoing breach
 * re-alerts every run, which is intended re-paging, not a bug.
 *
 * Exit contract: 0 when healthy OR when breaches were found and delivered;
 * 1 only when the check itself broke (DB/query failure, delivery failure,
 * or a breach with no delivery channel configured). A red workflow run
 * therefore means "the alerting pipeline is broken", which GitHub's own
 * workflow-failure emails surface.
 *
 * Env: DATABASE_URL (required); WORKER_URL (optional — public worker base);
 * delivery via RESEND_API_KEY + ALERT_EMAIL_TO (+ ALERT_EMAIL_FROM,
 * default mailer@dashseller.com) and/or ALERT_WEBHOOK_URL (Slack/Discord
 * incoming webhook — both read their key from the same JSON body).
 */
import { createDbClient } from "@dashseller/db/client";
import { sql } from "drizzle-orm";
import { Resend } from "resend";

const OLDEST_PENDING_ALERT_S = 900;
const QUEUE_FAILED_ALERT = 20;
const HTTP_TIMEOUT_MS = 10_000;

const maybeDatabaseUrl = process.env.DATABASE_URL;
if (!maybeDatabaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const databaseUrl: string = maybeDatabaseUrl;

const breaches: string[] = [];
const context: string[] = [];

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asText(value: unknown): string {
  return value == null ? "" : String(value);
}

async function checkDatabase(): Promise<void> {
  const { db, close } = createDbClient(databaseUrl);
  try {
    // Non-terminal outbox rows stuck for over an hour — includes
    // `conflict` rows, which always need a human.
    const stuck = await db.execute(sql`
      SELECT status, count(*)::int AS count, min(updated_at)::text AS oldest
      FROM sync_outbox
      WHERE status NOT IN ('confirmed', 'canceled')
        AND updated_at < now() - interval '1 hour'
      GROUP BY status
    `);
    for (const row of stuck.rows) {
      breaches.push(
        `outbox: ${asNumber(row.count)} row(s) stuck in "${asText(row.status)}" for >1h (oldest ${asText(row.oldest)})`
      );
    }

    // Connected channels whose orders/listings sync silently stopped —
    // the dispatcher fires every 15 min, so a 1-hour gap means the
    // schedule stopped or every run dies before recording an attempt.
    // Domains are generated per channel and LEFT-joined: sync-state rows
    // only exist once `recordDomainRun` fires, so a channel whose jobs
    // die before ever reaching the core has NO row — an inner join would
    // keep the alert green for exactly the most complete failure.
    // The connected_at guard gives a just-(re)connected channel the same
    // one-hour grace the run-gap check implies — otherwise a new channel
    // pages before its first dispatcher tick. NULL connected_at (legacy
    // rows) gets no grace: those channels are long past their first tick.
    const stale = await db.execute(sql`
      SELECT c.id, c.display_name, d.domain,
             s.last_run_at::text AS last_run_at
      FROM channel c
      CROSS JOIN (VALUES ('orders'), ('listings')) AS d(domain)
      LEFT JOIN channel_sync_state s
        ON s.channel_id = c.id AND s.domain::text = d.domain
      WHERE c.connected = true AND c.enabled = true AND c.archived = false
        AND (c.connected_at IS NULL OR c.connected_at < now() - interval '1 hour')
        AND (s.last_run_at IS NULL OR s.last_run_at < now() - interval '1 hour')
    `);
    for (const row of stale.rows) {
      breaches.push(
        `channel ${asText(row.display_name) || asText(row.id)}: ${asText(row.domain)} sync last ran ${asText(row.last_run_at) || "never"}`
      );
    }

    // Destructive marketplace events (uninstall / auth-revocation) whose
    // grant verification kept failing until the disconnect job's retries
    // exhausted. Delivery jobs are removed on failure and failing syncs
    // keep last_run_at fresh, so WITHOUT this marker the unresolved event
    // would leave no other breach. The prefix must match the disconnect
    // processor (apps/worker/src/processors/channels.ts). Self-silencing:
    // a reconnect AFTER the marker (connected_at newer) or a completed
    // disconnect (connected=false) resolves it — nothing records
    // channels-domain successes, so the row itself never clears.
    const unresolved = await db.execute(sql`
      SELECT c.id, c.display_name, s.error, s.updated_at::text AS marked_at
      FROM channel_sync_state s
      JOIN channel c ON c.id = s.channel_id
      WHERE s.domain = 'channels' AND s.status = 'error'
        AND s.error LIKE 'Unresolved disconnect:%'
        AND c.connected = true
        AND (c.connected_at IS NULL OR c.connected_at < s.updated_at)
    `);
    for (const row of unresolved.rows) {
      breaches.push(
        `channel ${asText(row.display_name) || asText(row.id)}: ${asText(row.error)} (since ${asText(row.marked_at)})`
      );
    }

    // Latest per-domain errors — context for the message body, not a
    // trigger (the column keeps the last error even after recovery
    // elsewhere makes it non-actionable).
    const errors = await db.execute(sql`
      SELECT channel_id, domain::text AS domain, error
      FROM channel_sync_state
      WHERE error IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    for (const row of errors.rows) {
      context.push(
        `channel ${asText(row.channel_id)} ${asText(row.domain)}: ${asText(row.error)}`
      );
    }
  } finally {
    await close();
  }
}

async function checkWorker(): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    return;
  }
  let ready: Response;
  try {
    ready = await fetch(new URL("/ready", workerUrl), {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (error) {
    breaches.push(
      `worker unreachable at ${workerUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
  if (!ready.ok) {
    breaches.push(`worker /ready answered ${ready.status}`);
  }

  try {
    const statsResponse = await fetch(new URL("/stats", workerUrl), {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!statsResponse.ok) {
      breaches.push(`worker /stats answered ${statsResponse.status}`);
      return;
    }
    const stats = (await statsResponse.json()) as {
      outbox?: {
        oldestPendingAgeSeconds?: number | null;
        reconciliationRequired?: number;
      };
      queues?: Record<string, { failed?: number }>;
    };
    const reconciliationRequired = asNumber(
      stats.outbox?.reconciliationRequired
    );
    if (reconciliationRequired > 0) {
      breaches.push(
        `outbox: ${reconciliationRequired} row(s) in reconciliation_required`
      );
    }
    const oldestPending = stats.outbox?.oldestPendingAgeSeconds;
    if (
      typeof oldestPending === "number" &&
      oldestPending > OLDEST_PENDING_ALERT_S
    ) {
      breaches.push(
        `outbox: oldest pending row is ${Math.round(oldestPending / 60)} min old (drainer runs every minute)`
      );
    }
    for (const [queueName, counts] of Object.entries(stats.queues ?? {})) {
      const failed = asNumber(counts.failed);
      if (failed > QUEUE_FAILED_ALERT) {
        breaches.push(`queue ${queueName}: ${failed} failed jobs`);
      }
    }
  } catch (error) {
    breaches.push(
      `worker /stats failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function deliver(message: string): Promise<boolean> {
  let delivered = false;

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Slack reads `text`, Discord reads `content`; each ignores the other.
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`alert webhook answered ${response.status}`);
    }
    delivered = true;
  }

  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.ALERT_EMAIL_TO;
  if (resendKey && emailTo) {
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from: process.env.ALERT_EMAIL_FROM ?? "mailer@dashseller.com",
      to: [emailTo],
      subject: `[dashseller ops] ${breaches.length} alert(s)`,
      text: message,
    });
    if (error) {
      throw new Error(`resend: ${error.message}`);
    }
    delivered = true;
  }

  return delivered;
}

try {
  await checkDatabase();
  await checkWorker();
} catch (error) {
  console.error(
    "alert check failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}

if (breaches.length === 0) {
  console.log("healthy — no breaches");
  process.exit(0);
}

const MAX_LINES = 40;
const message = [
  `${breaches.length} breach(es):`,
  ...breaches.slice(0, MAX_LINES).map((line) => `- ${line}`),
  ...(breaches.length > MAX_LINES
    ? [`… and ${breaches.length - MAX_LINES} more`]
    : []),
  ...(context.length > 0
    ? [
        "",
        "Recent channel sync errors (context):",
        ...context.map((l) => `- ${l}`),
      ]
    : []),
].join("\n");
console.log(message);

try {
  const delivered = await deliver(message);
  if (!delivered) {
    console.error(
      "breaches found but no delivery channel configured (set RESEND_API_KEY+ALERT_EMAIL_TO or ALERT_WEBHOOK_URL)"
    );
    process.exit(1);
  }
  process.exit(0);
} catch (error) {
  console.error(
    "alert delivery failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}
