/**
 * Normalizes a tracking number to its canonical cross-system form.
 *
 * Trims surrounding whitespace and uppercases. Carrier-issued tracking
 * numbers (USPS, UPS, FedEx, DHL, …) are uppercase ASCII alphanumeric,
 * so case-folding has no semantic effect — it just defends against
 * accidental lowercasing somewhere in the pipeline.
 *
 * Returns null for null / undefined / empty / whitespace-only inputs so
 * downstream equality checks (e.g. the reconciliation `tracking_match`
 * rung) skip cleanly when either side lacks a tracking number.
 *
 * Lives in shipment-tracking because tracking numbers are this package's
 * domain. Marketplace adapters (the upstream side of the rail) and the
 * trigger reconciliation step (the downstream side) both call through
 * here so any tracking string crossing the system is canonical.
 *
 * Rule: FUL-003 — an empty tracking never matches another empty tracking.
 * Returning null here is what enforces that downstream.
 */
export function normalizeTracking(t: string | null | undefined): string | null {
  if (t == null) {
    return null;
  }
  const trimmed = t.trim().toUpperCase();
  return trimmed === "" ? null : trimmed;
}
