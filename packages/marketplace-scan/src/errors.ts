/**
 * Typed error for non-2xx responses from the mobile/unofficial marketplace
 * APIs that this package targets. Adapters throw this instead of bare `Error`
 * so callers (token manager, trigger workflows) can route on `.status` —
 * notably 401/403 → mark the bearer dead vs. 5xx → soft backoff.
 */
export class ScanRequestError extends Error {
  /** HTTP status code from the upstream response. */
  readonly status: number;
  /** Short identifier of the adapter endpoint (for logs). */
  readonly endpoint: string;
  /** Truncated response body for debugging. May be empty. */
  readonly body: string;

  constructor(args: {
    endpoint: string;
    message: string;
    status: number;
    body?: string;
  }) {
    super(args.message);
    this.name = "ScanRequestError";
    this.status = args.status;
    this.endpoint = args.endpoint;
    this.body = args.body ?? "";
  }

  /** True for 401/403 — bearer is rejected, profile should be marked dead. */
  isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /**
   * True for 429 / 5xx — transient; profile gets a cooldown but stays active.
   * Excludes 4xx auth/client errors which need different handling.
   */
  isTransientFailure(): boolean {
    return this.status === 429 || (this.status >= 500 && this.status < 600);
  }
}
