/**
 * Listing work — the one task that scans listing detail. Self-recursive:
 *
 *   • LAUNCHER branch (`listingIds.length > listingScanBatchSize`): too many ids
 *     for one box/IP, so chunk into `<= K` pieces and `batchTrigger` ITSELF, one
 *     run per chunk, fire-and-forget. Returns a fast handoff. This is what the
 *     cron orphan-catch hits — it hands the whole stale-listing array and ignores
 *     the verdicts.
 *   • LEAF branch (`listingIds.length <= K`): fits one box, so scan the ids
 *     inline in a PACED loop (one persona load + bearer mint reused per request),
 *     persist-and-discard each, and return `{ verdicts, ... }`. Awaiting callers
 *     (seller wave, keyword validation) pass `<= K` chunks so they always hit
 *     this branch and read verdicts back.
 *
 * There is no separate single-listing task: "scan one listing" is a 1-element
 * `listingIds`. Recursion depth is 1 — a leaf run never re-fans (its input is
 * `<= K` by construction).
 *
 * Pacing is load-bearing, not an optimization: a leaf's `<= K` fetches all leave
 * the SAME box's pinned IP/persona, back-to-back. Sequential + jittered delay
 * (config-driven) reproduces today's per-IP rate so the burst doesn't look like a
 * bot. Small K spreads work across more boxes/IPs; that fan-out IS the IP-spread.
 *
 * Errors are classified, never thrown for scan failures:
 *   • persona-level (401/403 auth, 429/5xx transient) → the IP is throttled or
 *     the device rejected. Stop the batch, route the failure ONCE, leave the rest
 *     stale for the cron to re-pick (likely on a different box). We do NOT throw —
 *     a thrown run would retry the whole batch immediately on the same bad IP.
 *   • per-listing (404 / parse / unknown) → tally as failed, leave that id stale,
 *     keep going. Does NOT degrade the persona (a missing listing is not the IP's
 *     fault — the old per-listing leaf marked these too coarsely).
 */
import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { logger, metadata, schemaTask, tags } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  type ListingVerdict,
  scanOneListing,
} from "../../nodes/scan/scan-one-listing";
import { BATCH_TRIGGER_AND_WAIT_MAX } from "../../utils/batch-trigger-and-wait-in-waves";
import { chunk } from "../../utils/chunk";
import { setMachineMetadata } from "../../utils/machine-metadata";
import { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import {
  loadScanConfig,
  type ScanConfig,
  scanConfigSchema,
} from "../../utils/scan-config";

const scanListingsByIdsSchema = z.object({
  config: scanConfigSchema.optional(),
  listingIds: z
    .array(z.string())
    .min(
      1,
      "scanListingsByIds requires a non-empty listingIds array; pass a 1-element array to scan a single listing"
    ),
  marketplace: z.string().min(1),
});

export type ScanListingsByIdsPayload = z.infer<typeof scanListingsByIdsSchema>;

/**
 * Two shapes, dispatched on input size. Awaiting callers pass `<= K` so they get
 * `mode: "scanned"` (with `verdicts`); the cron passes the whole array and gets
 * `mode: "fanned"` (which it ignores).
 */
export type ScanListingsByIdsResult =
  | { marketplace: string; mode: "fanned"; triggered: number }
  | {
      aborted: boolean;
      failed: number;
      marketplace: string;
      mode: "scanned";
      succeeded: number;
      triggered: number;
      unfit: number;
      verdicts: ListingVerdict[];
    };

export const scanListingsByIds = schemaTask({
  id: "scan-listings-by-ids",
  schema: scanListingsByIdsSchema,
  // Both branches run on micro: the launcher does no HTTP; the leaf holds one
  // listing blob at a time (persist-and-discard), like the old single leaf.
  // Escalates to small-1x only if a pathological listing blows the 0.25 GB cap.
  machine: "micro",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30_000,
    outOfMemory: { machine: "small-1x" },
  },
  run: async (payload): Promise<ScanListingsByIdsResult> => {
    await setMachineMetadata();
    const { marketplace, listingIds } = payload;
    const config = payload.config ?? (await loadScanConfig(marketplace));
    const batchSize = Math.max(1, config.listingScanBatchSize);

    if (listingIds.length > batchSize) {
      return await fanOut(marketplace, listingIds, config, batchSize);
    }
    return await scanInline(marketplace, listingIds, config);
  },
});

/** LAUNCHER branch — chunk into `<= K` and `batchTrigger` self, one run/chunk. */
async function fanOut(
  marketplace: string,
  listingIds: string[],
  config: ScanConfig,
  batchSize: number
): Promise<ScanListingsByIdsResult> {
  const chunks = chunk(listingIds, batchSize);

  metadata
    .set("marketplace", marketplace)
    .set("mode", "fanned")
    .set("listingCount", listingIds.length)
    .set("chunks", chunks.length)
    .set("status", "fanning-out");

  let triggered = 0;
  // Self-chunk the batchTrigger calls to the 1000-item cap (chunks, not ids).
  for (let i = 0; i < chunks.length; i += BATCH_TRIGGER_AND_WAIT_MAX) {
    const wave = chunks.slice(i, i + BATCH_TRIGGER_AND_WAIT_MAX);
    await scanListingsByIds.batchTrigger(
      wave.map((chunkIds) => ({
        payload: { marketplace, listingIds: chunkIds, config },
        options: {
          tags: [`marketplace_${marketplace}`, "scan_listing_batch"],
        },
      }))
    );
    for (const chunkIds of wave) {
      triggered += chunkIds.length;
    }
  }

  metadata.set("status", "fanned").set("triggered", triggered);
  logger.info("Fanned out listing batches", {
    marketplace,
    chunks: chunks.length,
    triggered,
  });
  return { marketplace, mode: "fanned", triggered };
}

/** LEAF branch — paced inline scan of `<= K` ids, returns verdicts. */
async function scanInline(
  marketplace: string,
  listingIds: string[],
  config: ScanConfig
): Promise<ScanListingsByIdsResult> {
  await tags.add(`marketplace_${marketplace}`);
  await tags.add("scan_listing_batch");
  metadata
    .set("marketplace", marketplace)
    .set("mode", "scanned")
    .set("listingCount", listingIds.length)
    .set("status", "loading-profile");

  const manager = await MobileProfileTokenManager.loadForThisBox(marketplace);
  metadata.set("profileId", manager.profileId).set("status", "scanning");
  const client = await manager.createScanClient();

  const outcome = await runListingBatch(
    { client, config, manager, marketplace },
    listingIds
  );

  if (outcome.aborted) {
    await tags.add("scan_aborted_persona");
  }
  metadata
    .set("status", outcome.aborted ? "aborted-persona" : "completed")
    .set("succeeded", outcome.succeeded)
    .set("failed", outcome.failed)
    .set("unfit", outcome.unfit)
    .set("aborted", outcome.aborted);
  logger.info("Listing batch scanned", {
    marketplace,
    listingCount: listingIds.length,
    succeeded: outcome.succeeded,
    failed: outcome.failed,
    unfit: outcome.unfit,
    aborted: outcome.aborted,
  });

  return {
    aborted: outcome.aborted,
    failed: outcome.failed,
    marketplace,
    mode: "scanned",
    succeeded: outcome.succeeded,
    triggered: listingIds.length,
    unfit: outcome.unfit,
    verdicts: outcome.verdicts,
  };
}

interface BatchOutcome {
  aborted: boolean;
  failed: number;
  succeeded: number;
  unfit: number;
  verdicts: ListingVerdict[];
}

interface PersonaError {
  authFailure: boolean;
  message: string;
}

interface ListingScanContext {
  client: Awaited<ReturnType<MobileProfileTokenManager["createScanClient"]>>;
  config: ScanConfig;
  manager: MobileProfileTokenManager;
  marketplace: string;
}

interface BatchState {
  failed: number;
  // First persona-level error wins; once set, no new fetches start. A holder
  // property (not a closure-mutated `let`) keeps TS from narrowing it to `null`.
  personaError: PersonaError | null;
  succeeded: number;
  unfit: number;
  verdicts: ListingVerdict[];
}

/**
 * Paced worker pool over the batch's ids. `listingScanConcurrency` workers each
 * pull from a shared queue, jitter-sleep, then scan one listing. The first
 * persona-level error stops all workers (no new fetches start; in-flight ones
 * finish) and is routed once afterward. Never throws on scan failures.
 */
async function runListingBatch(
  ctx: ListingScanContext,
  listingIds: string[]
): Promise<BatchOutcome> {
  const state: BatchState = {
    failed: 0,
    personaError: null,
    succeeded: 0,
    unfit: 0,
    verdicts: [],
  };
  const queue = [...listingIds];
  const concurrency = clamp(
    ctx.config.listingScanConcurrency,
    1,
    listingIds.length
  );

  await Promise.all(
    Array.from({ length: concurrency }, () =>
      runListingWorker(state, queue, ctx)
    )
  );

  if (state.personaError !== null) {
    // Route ONCE (not once per remaining id). Unscanned ids keep their old
    // last_scanned_at, so the cron orphan-catch re-picks them next tick.
    await routePersonaError(ctx.manager, state.personaError);
    logger.warn("Listing batch aborted on persona-level error", {
      marketplace: ctx.marketplace,
      message: state.personaError.message,
      remaining: queue.length,
    });
  }

  return {
    aborted: state.personaError !== null,
    failed: state.failed,
    succeeded: state.succeeded,
    unfit: state.unfit,
    verdicts: state.verdicts,
  };
}

/** One worker: drain the shared queue, paced, until empty or a persona abort. */
async function runListingWorker(
  state: BatchState,
  queue: string[],
  ctx: ListingScanContext
): Promise<void> {
  const { config, marketplace } = ctx;
  while (state.personaError === null) {
    const listingId = queue.shift();
    if (listingId === undefined) {
      return;
    }
    await sleep(
      jitterMs(config.listingScanDelayMinMs, config.listingScanDelayMaxMs)
    );
    if (state.personaError !== null) {
      return;
    }
    try {
      const verdict = await scanOneListing({ ...ctx, listingId });
      state.verdicts.push(verdict);
      state.succeeded += 1;
      if (!verdict.fit) {
        state.unfit += 1;
      }
    } catch (error) {
      if (isPersonaLevelError(error)) {
        state.personaError ??= toPersonaError(error);
        return;
      }
      state.failed += 1;
      logger.warn("Listing scan failed; left stale", {
        marketplace,
        listingId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** 401/403 (device rejected) or 429/5xx (IP throttled) → back off the whole IP. */
function isPersonaLevelError(error: unknown): boolean {
  return (
    error instanceof ScanRequestError &&
    (error.isAuthFailure() || error.isTransientFailure())
  );
}

function toPersonaError(error: unknown): PersonaError {
  return {
    authFailure: error instanceof ScanRequestError && error.isAuthFailure(),
    message: error instanceof Error ? error.message : String(error),
  };
}

function routePersonaError(
  manager: MobileProfileTokenManager,
  personaError: PersonaError
): Promise<void> {
  return personaError.authFailure
    ? manager.markDataAuthFailure(personaError.message)
    : manager.markSoftFailure(personaError.message);
}

function jitterMs(min: number, max: number): number {
  const lo = Math.max(0, min);
  const hi = Math.max(lo, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
