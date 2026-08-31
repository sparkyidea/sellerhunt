/**
 * Trigger a list of child runs in waves, waiting for each wave to fully settle
 * before starting the next. This is what sequences the discovery pipeline: a
 * keyword walks its sellers one at a time, a seller walks its listings a wave at
 * a time, so a child branch only exists while its parent is actually working it
 * instead of the whole fan-out being spawned up front.
 *
 * `waveSize` doubles as the per-call chunking for the 1000-item
 * `batchTriggerAndWait` cap, so it must be `<= 1000`. Callers that want strict
 * one-at-a-time pass 1; callers that just want "fire them all and wait" pass the
 * cap.
 *
 * Waves are run strictly sequentially — `batchTriggerAndWait` is a single
 * waitpoint and a run may only hold one at a time, so a `Promise.all` over waves
 * would trip the engine's concurrent-wait guard.
 *
 * Individual child failures are tallied, not thrown: each child has its own
 * retries, and anything that still fails is left stale for the cron orphan-catch
 * to re-pick. Failing the parent here would just strand the siblings that
 * already succeeded — the caller decides whether the tally warrants failing.
 *
 * `failed` counts children whose run crashed (`run.ok === false`). A child can
 * also finish OK yet not have done all its work (e.g. a persona-abort that left
 * ids unscanned); pass `isComplete` to fold those into `incomplete` so the caller
 * can distinguish "the whole wave finished its work" from "every run merely
 * didn't crash".
 */

/**
 * Trigger.dev rejects a `batchTriggerAndWait` call with more than this many
 * items. Pass it as the wave size to mean "fire them all and wait" — the only
 * reason to split is the API cap, not throttling.
 */
export const BATCH_TRIGGER_AND_WAIT_MAX = 1000;

interface BatchTriggerAndWaitLike<TItem, TRun> {
  batchTriggerAndWait: (items: TItem[]) => Promise<{ runs: TRun[] }>;
}

export interface WaveResult {
  /** Children whose run failed after exhausting retries (`run.ok === false`). */
  failed: number;
  /**
   * Children that did not fully complete — a superset of `failed` that also
   * counts runs which finished OK but reported partial work (per `isComplete`,
   * e.g. a persona-abort that left ids unscanned). Equals `failed` when no
   * predicate is supplied.
   */
  incomplete: number;
  /** Children whose run completed successfully (did not crash). */
  succeeded: number;
  /** Total children triggered across all waves. */
  triggered: number;
  /** Number of waves dispatched. */
  waves: number;
}

export async function batchTriggerAndWaitInWaves<
  TItem,
  TRun extends { ok: boolean },
>(
  task: BatchTriggerAndWaitLike<TItem, TRun>,
  items: TItem[],
  waveSize: number,
  // Defaults to "the run didn't crash". Callers whose children can finish OK yet
  // leave work undone pass a stricter check (e.g. inspect the run output).
  isComplete: (run: TRun) => boolean = (run) => run.ok
): Promise<WaveResult> {
  const result: WaveResult = {
    waves: 0,
    triggered: 0,
    succeeded: 0,
    failed: 0,
    incomplete: 0,
  };

  for (let i = 0; i < items.length; i += waveSize) {
    const wave = items.slice(i, i + waveSize);
    const { runs } = await task.batchTriggerAndWait(wave);

    result.waves += 1;
    result.triggered += wave.length;
    for (const run of runs) {
      if (run.ok) {
        result.succeeded += 1;
      } else {
        result.failed += 1;
      }
      if (!isComplete(run)) {
        result.incomplete += 1;
      }
    }
  }

  return result;
}
