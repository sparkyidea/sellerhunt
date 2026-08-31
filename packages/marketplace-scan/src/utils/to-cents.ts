/**
 * Convert display dollars (number) → integer cents.
 *
 * Mirrors the seller-side `Math.round(value * 100)` pattern used inline in
 * `@dashseller/marketplace`'s mappers. Centralized here because every
 * scan-side mapper does the same conversion at the same boundary.
 *
 * Returns null for null/NaN/Infinity inputs so callers can pass through
 * partial responses without an extra guard.
 */
export function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) {
    return null;
  }
  if (!Number.isFinite(amount)) {
    return null;
  }
  return Math.round(amount * 100);
}
