const UNIQUE_VIOLATION = "23505";

interface PgErrorLike {
  cause?: unknown;
  code?: unknown;
  constraint?: unknown;
}

/**
 * drizzle-orm ≥ 0.44 wraps driver errors in `DrizzleQueryError` and keeps the
 * `pg` error on `.cause`; older paths throw the pg error directly. Walk the
 * cause chain until a `code` shows up.
 */
function findPgError(
  error: unknown,
  depth = 0
): { code: string; constraint?: string } | null {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return null;
  }
  const candidate = error as PgErrorLike;
  if (typeof candidate.code === "string") {
    return {
      code: candidate.code,
      constraint:
        typeof candidate.constraint === "string"
          ? candidate.constraint
          : undefined,
    };
  }
  return findPgError(candidate.cause, depth + 1);
}

/** True for a Postgres unique-violation, optionally scoped to one constraint. */
export function isUniqueViolation(
  error: unknown,
  constraint?: string
): boolean {
  const pg = findPgError(error);
  if (!pg || pg.code !== UNIQUE_VIOLATION) {
    return false;
  }
  return constraint === undefined || pg.constraint === constraint;
}
