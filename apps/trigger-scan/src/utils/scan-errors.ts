import { ScanRequestError } from "@dashseller/marketplace-scan/errors";

export const PERSONA_RETRY_MS = 20 * 60 * 1000;

export class ScanIncompleteError extends Error {
  readonly reason: string;
  readonly details: Record<string, unknown>;
  constructor(reason: string, details: Record<string, unknown> = {}) {
    // Trigger.dev preserves Error.name/message, but drops custom properties.
    // Keep the reason first and structured details (including older run ID) in message.
    super(`Scan incomplete: ${reason}\n${JSON.stringify(details)}`);
    this.name = "ScanIncompleteError";
    this.reason = reason;
    this.details = details;
  }
}

export class PersonaScanError extends Error {
  readonly authFailure: boolean;
  readonly remaining: readonly string[];
  constructor(
    message: string,
    authFailure: boolean,
    remaining: readonly string[] = []
  ) {
    super(message);
    this.name = "PersonaScanError";
    this.authFailure = authFailure;
    this.remaining = remaining;
  }
}

export class ListingBatchError extends Error {
  readonly marketplace: string;
  readonly failed: readonly { listingId: string; message: string }[];
  constructor(
    marketplace: string,
    failed: readonly { listingId: string; message: string }[]
  ) {
    super(`${failed.length} listing checks failed for ${marketplace}`);
    this.name = "ListingBatchError";
    this.marketplace = marketplace;
    this.failed = failed;
  }
}

type PersonaUnavailableReason = "cooling" | "box-burned" | "pool-empty";
interface PersonaUnavailableDetails {
  app: string;
  label: string;
  until?: Date;
}
export class PersonaUnavailableError extends Error {
  readonly reason: PersonaUnavailableReason;
  readonly details: PersonaUnavailableDetails;
  constructor(
    reason: PersonaUnavailableReason,
    details: PersonaUnavailableDetails
  ) {
    super(`Persona unavailable for ${details.app}/${details.label}: ${reason}`);
    this.name = "PersonaUnavailableError";
    this.reason = reason;
    this.details = details;
  }
}

export function scanCatchError({ error }: { error: unknown }) {
  if (
    error instanceof PersonaScanError ||
    error instanceof PersonaUnavailableError ||
    (error instanceof ScanIncompleteError && error.reason === "in-flight")
  ) {
    return { retryDelayInMs: PERSONA_RETRY_MS };
  }
  return undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isPersonaLevelError(error: unknown): error is ScanRequestError {
  return (
    error instanceof ScanRequestError &&
    (error.isAuthFailure() || error.isTransientFailure())
  );
}

/** Route the persona once; callers may finish healthy downstream work before throwing. */
export async function routeScanFailure(
  manager: {
    markDataAuthFailure: (message: string) => Promise<void>;
    markSoftFailure: (message: string) => Promise<void>;
  },
  error: unknown,
  remaining: readonly string[] = []
): Promise<Error> {
  const message = errorMessage(error);
  if (isPersonaLevelError(error)) {
    if (error.isAuthFailure()) {
      await manager.markDataAuthFailure(message);
    } else {
      await manager.markSoftFailure(message);
    }
    return new PersonaScanError(message, error.isAuthFailure(), remaining);
  }
  await manager.markSoftFailure(message);
  return new ScanIncompleteError("request-failed", { message });
}

/** Child errors cross the SDK serialization boundary, losing their prototype. */
export function isInFlightFailure(error: unknown): boolean {
  if (error instanceof ScanIncompleteError) {
    return error.reason === "in-flight";
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    "message" in error &&
    error.name === "ScanIncompleteError" &&
    typeof error.message === "string" &&
    error.message.split("\n", 1)[0] === "Scan incomplete: in-flight"
  );
}
