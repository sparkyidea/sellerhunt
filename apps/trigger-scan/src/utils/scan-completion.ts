import { ScanRequestError } from "@dashseller/marketplace-scan/errors";

interface ScannedBatch {
  aborted: boolean;
  failed: number;
  mode: "scanned";
  notFound: number;
  verdicts: readonly unknown[];
}

type BatchRun =
  | { ok: false }
  | { ok: true; output: ScannedBatch | { mode: "fanned" } };

/** A negative detail response completes this check, without retiring the listing. */
export function isListingNotFound(
  error: unknown,
  marketplace: string
): boolean {
  return (
    error instanceof ScanRequestError &&
    error.status === 404 &&
    error.endpoint === `${marketplace}.get-listing`
  );
}

export function isListingBatchComplete(
  run: BatchRun,
  requested: number,
  coverageComplete = true
): boolean {
  if (!(coverageComplete && run.ok) || run.output.mode !== "scanned") {
    return false;
  }
  const { aborted, failed, notFound, verdicts } = run.output;
  const validCounts = [requested, failed, notFound].every(
    (count) => Number.isSafeInteger(count) && count >= 0
  );
  return (
    validCounts &&
    !aborted &&
    failed === 0 &&
    verdicts.length + notFound + failed === requested
  );
}
