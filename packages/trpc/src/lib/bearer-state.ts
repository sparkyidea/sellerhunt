import { mobileProfile } from "@dashseller/db/schema";
import type { WhereNode, WhereRule } from "@sparkyidea/dataview/types";
import { isWhereExpression } from "@sparkyidea/dataview/types";
import { or, type SQL, sql } from "drizzle-orm";

/**
 * `bearerState` is a derived dimension over the token-cache columns
 * (`access_token`, `access_token_expires_at`), not a stored column. The admin
 * token views filter, group and colour by it, so it is computed twice from one
 * definition: in `toPublic` for the row payload, and in SQL for `getMany`'s
 * WHERE clause. Both must agree — a row the filter returns must render with the
 * state the filter asked for.
 *
 * A cached bearer whose expiry is unknown (`access_token` set,
 * `access_token_expires_at` null — the manager persisted a token the upstream
 * gave no TTL for) counts as `expiring`: it is usable, but an operator should
 * look at it, which is exactly what that bucket is for.
 */

export const BEARER_STATES = ["valid", "expiring", "expired", "none"] as const;

export type BearerState = (typeof BEARER_STATES)[number];

/** Window before expiry in which a bearer counts as `expiring`. */
export const BEARER_EXPIRING_MINUTES = 15;

const EXPIRING_MS = BEARER_EXPIRING_MINUTES * 60 * 1000;

function isBearerState(value: unknown): value is BearerState {
  return (
    typeof value === "string" &&
    (BEARER_STATES as readonly string[]).includes(value)
  );
}

/** Row-level twin of `bearerStateWhere`. `now` is injectable for tests. */
export function bearerStateOf(
  row: { accessToken: string | null; accessTokenExpiresAt: Date | null },
  now: Date = new Date()
): BearerState {
  if (row.accessToken === null) {
    return "none";
  }
  if (row.accessTokenExpiresAt === null) {
    return "expiring";
  }
  const remaining = row.accessTokenExpiresAt.getTime() - now.getTime();
  if (remaining <= 0) {
    return "expired";
  }
  return remaining <= EXPIRING_MS ? "expiring" : "valid";
}

const expiringInterval = sql.raw(
  `interval '${BEARER_EXPIRING_MINUTES} minutes'`
);

/** SQL twin of `bearerStateOf`, evaluated against the database clock. */
function predicateFor(state: BearerState): SQL {
  const token = mobileProfile.accessToken;
  const expiresAt = mobileProfile.accessTokenExpiresAt;
  switch (state) {
    case "none":
      return sql`${token} is null`;
    case "expired":
      return sql`${token} is not null and ${expiresAt} <= now()`;
    case "expiring":
      return sql`${token} is not null and (${expiresAt} is null or (${expiresAt} > now() and ${expiresAt} <= now() + ${expiringInterval}))`;
    default:
      return sql`${token} is not null and ${expiresAt} > now() + ${expiringInterval}`;
  }
}

/**
 * OR of the given states. An empty list matches nothing — the caller asked for
 * a state set, so returning "everything" would be the wrong answer.
 */
export function bearerStateWhere(states: BearerState[]): SQL | undefined {
  if (states.length === 0) {
    return sql`false`;
  }
  const unique = [...new Set(states)];
  return unique.length === 1
    ? predicateFor(unique[0] as BearerState)
    : or(...unique.map(predicateFor));
}

/** States a single rule selects, or null when the rule is not understood. */
function statesForRule(rule: WhereRule): BearerState[] | null {
  const { condition, value } = rule;
  if (condition === "eq") {
    return isBearerState(value) ? [value] : null;
  }
  if (condition === "inArray") {
    if (!Array.isArray(value)) {
      return null;
    }
    const states = value.filter(isBearerState);
    return states.length === value.length ? states : null;
  }
  if (condition === "ne") {
    return isBearerState(value)
      ? BEARER_STATES.filter((state) => state !== value)
      : null;
  }
  if (condition === "notInArray") {
    if (!Array.isArray(value)) {
      return null;
    }
    const excluded = value.filter(isBearerState);
    return excluded.length === value.length
      ? BEARER_STATES.filter((state) => !excluded.includes(state))
      : null;
  }
  return null;
}

/**
 * Split top-level `bearerState` rules out of a dataview filter.
 *
 * `buildWhere` maps properties onto real columns, so a derived property has to
 * leave the tree before it gets there. Preset tabs and the filter toolbar both
 * emit `bearerState` as a top-level rule; a rule nested inside an and/or group
 * is left in place and will be rejected by `buildWhere` rather than silently
 * ignored here.
 */
export function splitBearerStateFilter(
  filter: WhereNode[] | null | undefined
): {
  rest: WhereNode[] | null;
  states: BearerState[] | null;
} {
  if (!filter || filter.length === 0) {
    return { rest: filter ?? null, states: null };
  }

  const rest: WhereNode[] = [];
  let states: BearerState[] | null = null;

  for (const node of filter) {
    if (isWhereExpression(node) || node.property !== "bearerState") {
      rest.push(node);
      continue;
    }
    const selected = statesForRule(node);
    if (selected === null) {
      // Unreadable rule: match nothing rather than quietly widening the result.
      states = [];
      continue;
    }
    // Multiple rules on one property AND together, same as `buildWhere`.
    states =
      states === null
        ? selected
        : states.filter((state) => selected.includes(state));
  }

  return { rest: rest.length > 0 ? rest : null, states };
}
