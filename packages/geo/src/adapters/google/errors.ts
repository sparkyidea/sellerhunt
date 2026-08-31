/**
 * Error thrown by the Google Maps Platform adapter.
 *
 * Carries the HTTP status plus Google's in-body `status` field
 * (e.g. `OVER_QUERY_LIMIT`, `REQUEST_DENIED`) so callers can
 * distinguish auth and quota failures from transport issues.
 */
export class GoogleGeoError extends Error {
  readonly httpStatus: number;
  readonly googleStatus: string | null;
  readonly endpoint: string;

  constructor(params: {
    httpStatus: number;
    googleStatus: string | null;
    googleErrorMessage: string;
    endpoint: string;
  }) {
    const status = params.googleStatus
      ? `${params.httpStatus}/${params.googleStatus}`
      : String(params.httpStatus);
    super(
      `Google ${params.endpoint} failed (${status}): ${params.googleErrorMessage}`
    );
    this.name = "GoogleGeoError";
    this.httpStatus = params.httpStatus;
    this.googleStatus = params.googleStatus;
    this.endpoint = params.endpoint;
  }
}
