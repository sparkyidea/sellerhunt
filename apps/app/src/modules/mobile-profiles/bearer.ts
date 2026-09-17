const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function magnitude(ms: number): string {
  if (ms < HOUR) {
    return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  }
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.round((ms % HOUR) / MINUTE);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  return `${Math.round(ms / DAY)}d`;
}

/** "in 42m" / "26m ago" / "—". Same wording as the token-state sheet. */
export function relativeToNow(
  value: Date | string | null | undefined,
  now: Date = new Date()
): string {
  if (!value) {
    return "—";
  }
  const delta = new Date(value).getTime() - now.getTime();
  return delta >= 0 ? `in ${magnitude(delta)}` : `${magnitude(-delta)} ago`;
}
