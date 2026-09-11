import { chunk } from "./chunk";

export const BATCH_TRIGGER_MAX = 1000;

/** Sequential API waves; never Promise.all Trigger.dev wait calls. */
export function batchWaves<T>(items: T[]): T[][] {
  return chunk(items, BATCH_TRIGGER_MAX);
}
