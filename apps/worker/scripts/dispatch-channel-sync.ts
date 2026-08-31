/**
 * Force an immediate orders + listings sync — the manual override for the
 * 15-minute `dispatch-channel-syncs` cadence (cutover observation, support).
 *
 *   cd apps/worker && bun scripts/dispatch-channel-sync.ts             # all eligible channels
 *   cd apps/worker && bun scripts/dispatch-channel-sync.ts <channelId> # one channel
 *   ... --force  # discard watermarks: full-window resync, not a catch-up
 *
 * Dedup gotcha this script absorbs: both domains coalesce on the id
 * `{domain}-{channelId}`, so a delayed job the scheduler already placed
 * silently swallows an immediate enqueue. After enqueueing, any surviving
 * DELAYED holder of that id is promoted to run now.
 *
 * Env (from apps/worker/.env via Bun's cwd auto-load, or the process
 * environment): DATABASE_URL, REDIS_QUEUE_URL. Deliberately not
 * `@dashseller/env/worker` — that would demand webhook/marketplace vars
 * this script never touches.
 */
import { createDbClient } from "@dashseller/db/client";
import { channel } from "@dashseller/db/schema";
import type { JobClient } from "@dashseller/job-client";
import { createJobClient, QUEUES } from "@dashseller/job-client";
import { and, eq } from "drizzle-orm";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set (run from apps/worker or --env-file)`);
    process.exit(1);
  }
  return value;
}

const args = process.argv.slice(2).filter((arg) => arg !== "--force");
const forceRefresh = process.argv.includes("--force");
const onlyChannelId = args[0];

const { db, close } = createDbClient(requireEnv("DATABASE_URL"));
const jobs = createJobClient(requireEnv("REDIS_QUEUE_URL"));

async function eligibleChannelIds(): Promise<string[]> {
  const where = onlyChannelId
    ? eq(channel.id, onlyChannelId)
    : and(
        eq(channel.connected, true),
        eq(channel.enabled, true),
        eq(channel.archived, false)
      );
  const rows = await db.select({ id: channel.id }).from(channel).where(where);
  return rows.map((row) => row.id);
}

/** Promote a delayed dedup-holder so "immediate" means immediate. */
async function promoteDelayedHolder(
  client: JobClient,
  queueName: (typeof QUEUES)[keyof typeof QUEUES],
  dedupId: string
): Promise<boolean> {
  const queue = client.queue(queueName);
  const holderId = await queue.getDeduplicationJobId(dedupId);
  if (!holderId) {
    return false;
  }
  const holder = await queue.getJob(holderId);
  if (!holder || (await holder.getState()) !== "delayed") {
    return false;
  }
  try {
    await holder.promote();
    return true;
  } catch {
    // Lost the race to the scheduler clock — the job is running anyway.
    return false;
  }
}

const channelIds = await eligibleChannelIds();
if (channelIds.length === 0) {
  console.error(
    onlyChannelId
      ? `Channel not found: ${onlyChannelId}`
      : "No eligible channels"
  );
  await jobs.close();
  await close();
  process.exit(1);
}

for (const channelId of channelIds) {
  await jobs.enqueueSyncChannelOrders({ channelId, forceRefresh });
  const ordersPromoted = await promoteDelayedHolder(
    jobs,
    QUEUES.syncOrders,
    `orders-${channelId}`
  );
  await jobs.enqueueSyncChannelListings({ channelId, forceRefresh });
  const listingsPromoted = await promoteDelayedHolder(
    jobs,
    QUEUES.syncListings,
    `listings-${channelId}`
  );
  console.log(
    `${channelId}: orders ${ordersPromoted ? "promoted" : "enqueued"}, listings ${listingsPromoted ? "promoted" : "enqueued"}${forceRefresh ? " (force)" : ""}`
  );
}

await jobs.close();
await close();
process.exit(0);
