/**
 * Error thrown by the Package Tracker / Ship24 tracking adapter.
 *
 * Carries the HTTP status and any upstream error message so callers can
 * distinguish auth/validation failures from transport issues.
 */
export class PackageTrackerError extends Error {
  readonly httpStatus: number;
  readonly upstreamMessage: string | null;

  constructor(params: {
    httpStatus: number;
    path: string;
    upstreamMessage: string | null;
  }) {
    const reason = params.upstreamMessage ?? `HTTP ${params.httpStatus}`;
    super(`Package Tracker API ${params.path} failed: ${reason}`);
    this.name = "PackageTrackerError";
    this.httpStatus = params.httpStatus;
    this.upstreamMessage = params.upstreamMessage;
  }
}
