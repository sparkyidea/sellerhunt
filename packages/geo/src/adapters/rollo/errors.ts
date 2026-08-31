/**
 * Error thrown by the Rollo autocomplete adapter.
 *
 * Rollo proxies the legacy Google Places API, so errors come from
 * two layers: HTTP-level transport failures and Google's in-body
 * `status` field (`OVER_QUERY_LIMIT`, `REQUEST_DENIED`, etc.). Both
 * surface through this single class so consumers have one type to
 * catch.
 */
export class RolloError extends Error {
  readonly endpoint: string;
  readonly googleStatus: string | null;
  readonly httpStatus: number;

  constructor(params: {
    endpoint: string;
    googleErrorMessage: string;
    googleStatus: string | null;
    httpStatus: number;
  }) {
    const status = params.googleStatus
      ? `${params.httpStatus}/${params.googleStatus}`
      : String(params.httpStatus);
    super(
      `Rollo ${params.endpoint} failed (${status}): ${params.googleErrorMessage}`
    );
    this.name = "RolloError";
    this.endpoint = params.endpoint;
    this.googleStatus = params.googleStatus;
    this.httpStatus = params.httpStatus;
  }
}
