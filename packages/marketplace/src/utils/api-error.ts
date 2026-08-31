/**
 * HTTP status from a marketplace SDK error.
 *
 * eBay's SDK exposes it as `meta.res.status` and has no `statusCode` property
 * at all — reading only `statusCode` matched nothing, so every eBay failure
 * fell through to the caller's default branch.
 */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return;
  }
  const candidate = error as {
    meta?: { res?: { status?: number } };
    response?: { status?: number };
    status?: number;
    statusCode?: number;
  };
  return (
    candidate.meta?.res?.status ??
    candidate.statusCode ??
    candidate.status ??
    candidate.response?.status
  );
}
