import {
  archiveListingPayloadSchema,
  JOBS,
  type JobClient,
  QUEUES,
  syncChannelListingsPayloadSchema,
} from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import {
  archiveListing,
  findRelinkableOrders,
  getDomainWatermark,
  syncChannelListings,
} from "@dashseller/sync";
import type { Registry } from "../registry";
import {
  type ChannelApiClientFactory,
  defaultApiClientFactory,
  throwIfRateLimited,
} from "./shared";

/**
 * Listings domain processors. `archive-listing` is deliberately a separate
 * job from `sync-channel-listings` and never coalesced with it — a delete
 * and an update are not interchangeable work.
 *
 * A successful `sync-channel-listings` run drives the listings-first
 * ordering: it chains the FIRST orders pull (only while the orders
 * watermark is still null — the gate in the orders core no-ops until then)
 * and enqueues `sync-order` repairs for lines whose stored listing-variant
 * reference now resolves.
 */
export function registerListingProcessors(params: {
  apiClientFactory?: ChannelApiClientFactory;
  ctx: SyncContext;
  jobs: JobClient;
  registry: Registry;
}): void {
  const {
    ctx,
    jobs,
    registry,
    apiClientFactory = defaultApiClientFactory,
  } = params;

  registry.register(
    QUEUES.syncListings,
    JOBS.syncChannelListings,
    async (job) => {
      const payload = syncChannelListingsPayloadSchema.parse(job.data);
      const apiClient = await apiClientFactory(ctx, payload.channelId);

      let result: Awaited<ReturnType<typeof syncChannelListings>>;
      try {
        result = await syncChannelListings(ctx, {
          apiClient,
          channelId: payload.channelId,
          forceRefresh: payload.forceRefresh,
        });
      } catch (error) {
        throwIfRateLimited(error);
      }

      if (!result.success) {
        throw new Error(
          `sync-channel-listings failed: ${result.errors.slice(0, 3).join("; ")}`
        );
      }

      // Chain the first orders pull once listings exist. `chained` gives it
      // its own dedup id — the plain "orders" id can be held by an active
      // gated job, which would silently swallow this add and lose the
      // first pull. A concurrent real pull is harmless (idempotent).
      // Rule: SYN-006 — the duplication is deliberate. SYN-005 for why
      // this ordering exists at all.
      const ordersWatermark = await getDomainWatermark(
        ctx,
        payload.channelId,
        "orders"
      );
      let ordersChained = false;
      if (ordersWatermark === null) {
        await jobs.enqueueSyncChannelOrders(
          { channelId: payload.channelId, forceRefresh: false },
          { chained: true }
        );
        ordersChained = true;
      }

      // Late-link repair: re-sync orders whose stored references resolve
      // against the listing world this run just built.
      const relinkable = await findRelinkableOrders(ctx, {
        channelId: payload.channelId,
      });
      for (const orderReference of relinkable) {
        await jobs.enqueueSyncOrder({
          channelId: payload.channelId,
          orderReference,
        });
      }

      return {
        totalPulled: result.totalPulled,
        archived: result.archived,
        staleRejected: result.staleRejected,
        ordersChained,
        relinkEnqueued: relinkable.length,
      };
    }
  );

  registry.register(QUEUES.syncListings, JOBS.archiveListing, async (job) => {
    const payload = archiveListingPayloadSchema.parse(job.data);
    const outcome = await archiveListing(ctx, {
      channelId: payload.channelId,
      reference: payload.listingReference,
      tombstoneVersion: new Date(payload.tombstoneVersionAt),
    });
    // stale and not-found are terminal outcomes, not failures: the
    // tombstone was outrun by fresher data, or the listing never synced.
    return { outcome };
  });
}
