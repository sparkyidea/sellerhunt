/**
 * Split an array into fixed-size chunks. Used to slice listing ids into `<= K`
 * batches for `scan-listings-by-ids` leaf runs (the seller wave, the keyword
 * validation batches, and cron dispatch).
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) {
    out.push(items.slice(i, i + step));
  }
  return out;
}
