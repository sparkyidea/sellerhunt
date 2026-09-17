import { db } from "@dashseller/db";
import { isUniqueViolation } from "@dashseller/db/lib/pg-errors";
import { decryptSecret, encryptSecret } from "@dashseller/db/lib/secret-crypto";
import { isWorkerHostname } from "@dashseller/db/lib/worker-hostname";
import { mobileProfile, type SelectMobileProfile } from "@dashseller/db/schema";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { permissionProcedure, router } from "../index";
import {
  bearerStateOf,
  bearerStateWhere,
  splitBearerStateFilter,
} from "../lib/bearer-state";
import { buildWhere } from "../lib/build-filter";
import { buildGroupWhere } from "../lib/build-group";
import { buildSearchFilter } from "../lib/build-search";
import { buildCursor } from "../lib/build-sort";
import {
  credentialsInputSchema,
  mobileProfileStatusSchema,
  pickPublicIdentifiers,
} from "../lib/mobile-credentials";
import { getManyInput } from "../lib/schemas";

/**
 * Admin CRUD over the `mobile_profile` persona pool. Every procedure names
 * its `mobileProfile` verb via `permissionProcedure`. Ciphertext columns never
 * leave this file; credentials are
 * encrypted on write with `ctx.encryptionKey` and only an allowlist of
 * identifiers is ever decrypted for display.
 *
 * Mutations that invalidate a running worker's in-memory view bump
 * `revision` (see `fencedProfileWhere` in `@dashseller/db`); the worker's next
 * write then fails closed instead of undoing the admin change.
 */

const WORKER_UNIQUE_INDEX = "mobile_profile_app_assigned_worker_uidx";
const FAILURE_REASON_MAX = 500;

/** The database-assigned profile number — the id everywhere, "#12" on screen. */
const profileId = z.number().int().positive();
const idInput = z.object({ id: profileId });
/** Bulk ops take ids the table already listed, so one page is the natural cap. */
const idsInput = z.object({ ids: z.array(profileId).min(1).max(100) });
/**
 * A box hostname as the `boxinfo` sidecar reports it. Validated so a typo
 * cannot produce an assignment no box will ever match; `null` unassigns.
 */
const assignedWorkerSchema = z
  .string()
  .trim()
  .refine(isWorkerHostname, {
    message: "Not a hostname: letters, digits and hyphens only, up to 63",
  })
  .nullable();

/**
 * One capture entry as the bulk pane reads it: the file carries its own app
 * and the credentials, nothing else. The profile's number (`id`) comes from
 * the database, and no worker — upload never assigns; the operator does that
 * from the profile afterwards.
 */
const entryInput = credentialsInputSchema;

/** A paste is one operator's capture batch, not an import job — one page of entries. */
const entriesInput = z.object({ entries: z.array(entryInput).min(1).max(100) });

/** `revision + 1` — fences out runs that loaded the row before this write. */
const bumpRevision = { revision: sql`${mobileProfile.revision} + 1` };

/** Strip ciphertext columns; expose booleans and the derived bearer state instead. */
function toPublic(row: SelectMobileProfile) {
  const { credentials: _credentials, accessToken, refreshToken, ...rest } = row;
  return {
    ...rest,
    hasCachedBearer: accessToken !== null,
    hasRefreshToken: refreshToken !== null,
    bearerState: bearerStateOf({
      accessToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
    }),
  };
}

export type PublicMobileProfile = ReturnType<typeof toPublic>;

async function requireProfile(id: number): Promise<SelectMobileProfile> {
  const row = await db.query.mobileProfile.findFirst({
    where: eq(mobileProfile.id, id),
  });
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Mobile profile not found",
    });
  }
  return row;
}

function workerConflict(app: string, hostname: string): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: `Box ${hostname} already has a ${app} profile`,
  });
}

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Mobile profile not found",
    });
  }
  return row;
}

async function decryptIdentifiers(
  row: SelectMobileProfile,
  encryptionKey: string
): Promise<{
  identifiers: Record<string, string> | null;
  credentialsReadable: boolean;
}> {
  try {
    const json = await decryptSecret(row.credentials, encryptionKey);
    return {
      identifiers: pickPublicIdentifiers(row.app, JSON.parse(json)),
      credentialsReadable: true,
    };
  } catch {
    // Rotated key or corrupt blob: the page must still render.
    return { identifiers: null, credentialsReadable: false };
  }
}

// One procedure per statement verb (packages/auth lib/auth/permissions.ts).
// Operational mutations — reset failures, evict a bearer, replace credentials —
// are `update`: they change the row, never its identity.
const readProfiles = permissionProcedure({ mobileProfile: ["read"] });
const createProfiles = permissionProcedure({ mobileProfile: ["create"] });
const updateProfiles = permissionProcedure({ mobileProfile: ["update"] });
const deleteProfiles = permissionProcedure({ mobileProfile: ["delete"] });

export const mobileProfileRouter = router({
  get: readProfiles.input(idInput).query(async ({ ctx, input }) => {
    const row = await requireProfile(input.id);
    const decrypted = await decryptIdentifiers(row, ctx.encryptionKey);
    return { ...toPublic(row), ...decrypted };
  }),

  getMany: readProfiles.input(getManyInput).query(async ({ input }) => {
    const { cursor, limit, search, filter, sort, groupBy } = input;
    const { after, before } = getCursorParams(cursor);

    // `bearerState` is derived, not a column: it leaves the tree before
    // `buildWhere` and becomes its own SQL predicate.
    const { rest: columnFilter, states } = splitBearerStateFilter(filter);
    const filterWhere = buildWhere(mobileProfile, columnFilter);
    const stateWhere = states === null ? undefined : bearerStateWhere(states);
    const searchQuery = buildSearchFilter(
      search?.search ?? "",
      search?.searchFields ?? []
    );
    const searchWhere = buildWhere(
      mobileProfile,
      searchQuery ? [searchQuery] : null
    );
    const groupWhere = groupBy
      ? (buildGroupWhere(mobileProfile, groupBy.type, groupBy.key) ?? undefined)
      : undefined;

    const effectiveSort =
      sort.length > 0
        ? sort
        : [{ property: "createdAt", direction: "desc" } as const];
    const primaryDirection = effectiveSort[0]?.direction ?? "desc";
    const sortWithTiebreaker = [
      ...effectiveSort,
      { property: "id", direction: primaryDirection } as const,
    ];

    const direction = before ? "backward" : "forward";
    const { orderBy, cursorWhere } = buildCursor(mobileProfile, {
      sort: sortWithTiebreaker,
      cursor: after ?? before,
      direction,
    });

    const rows = await db.query.mobileProfile.findMany({
      where: and(filterWhere, stateWhere, searchWhere, cursorWhere, groupWhere),
      orderBy,
      limit: limit + 1,
    });

    const hasExtra = rows.length > limit;
    if (hasExtra) {
      rows.pop();
    }
    if (direction === "backward") {
      rows.reverse();
    }

    const items = rows.map(toPublic);
    // Cursors are opaque strings to the dataview; `buildCursor` compares them
    // back against the integer id in SQL.
    const first = items[0];
    const last = items.at(-1);
    return {
      items,
      startCursor: first ? String(first.id) : null,
      endCursor: last ? String(last.id) : null,
      hasNextPage: direction === "forward" ? hasExtra : !!before,
      hasPreviousPage: direction === "backward" ? hasExtra : !!after,
    };
  }),

  create: createProfiles.input(entryInput).mutation(async ({ ctx, input }) => {
    const encrypted = await encryptSecret(
      JSON.stringify(input.credentials),
      ctx.encryptionKey
    );
    const rows = await db
      .insert(mobileProfile)
      .values({ app: input.app, credentials: encrypted })
      .returning();
    return toPublic(firstRow(rows));
  }),

  /**
   * The bulk pane's write: one insert per call, every entry or none. Nothing
   * about an entry can collide with the pool — the number comes from the
   * database and no worker is assigned — so there is no per-entry outcome to
   * report beyond the number each entry received, in input order.
   */
  createMany: createProfiles
    .input(entriesInput)
    .mutation(async ({ ctx, input }) => {
      const values = await Promise.all(
        input.entries.map(async (entry) => ({
          app: entry.app,
          credentials: await encryptSecret(
            JSON.stringify(entry.credentials),
            ctx.encryptionKey
          ),
        }))
      );
      const rows = await db
        .insert(mobileProfile)
        .values(values)
        .returning({ id: mobileProfile.id });
      return {
        created: rows.length,
        results: rows.map((row, position) => ({ id: row.id, position })),
      };
    }),

  /**
   * Worker assignment and/or status. `app` is immutable. A
   * status change bumps `revision` (a running worker's view of "active" is
   * now wrong); a reassignment does not — worker writes are id-keyed, the box
   * that loaded the row keeps a valid view, and the old box simply fails to
   * load a persona next run. `assignedWorker: null` unassigns.
   */
  update: updateProfiles
    .input(
      idInput
        .extend({
          assignedWorker: assignedWorkerSchema.optional(),
          status: mobileProfileStatusSchema.optional(),
        })
        .refine(
          (value) =>
            value.assignedWorker !== undefined || value.status !== undefined,
          { message: "Nothing to update" }
        )
    )
    .mutation(async ({ input }) => {
      const row = await requireProfile(input.id);
      const statusChanged =
        input.status !== undefined && input.status !== row.status;
      try {
        const rows = await db
          .update(mobileProfile)
          .set({
            ...(input.assignedWorker === undefined
              ? {}
              : { assignedWorker: input.assignedWorker }),
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(statusChanged ? bumpRevision : {}),
          })
          .where(eq(mobileProfile.id, input.id))
          .returning();
        return toPublic(firstRow(rows));
      } catch (error) {
        if (isUniqueViolation(error, WORKER_UNIQUE_INDEX)) {
          throw workerConflict(row.app, input.assignedWorker ?? "");
        }
        throw error;
      }
    }),

  /**
   * Full credential set for the row's app. Also drops the cached bearer and
   * refresh token (they belonged to the previous persona) and bumps
   * `revision` so a run still holding the old capture cannot write back.
   */
  replaceCredentials: updateProfiles
    .input(idInput.and(credentialsInputSchema))
    .mutation(async ({ ctx, input }) => {
      const row = await requireProfile(input.id);
      if (row.app !== input.app) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Profile app is ${row.app}; credentials were for ${input.app}`,
        });
      }
      const encrypted = await encryptSecret(
        JSON.stringify(input.credentials),
        ctx.encryptionKey
      );
      const rows = await db
        .update(mobileProfile)
        .set({
          credentials: encrypted,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshToken: null,
          refreshTokenExpiresAt: null,
          ...bumpRevision,
        })
        .where(eq(mobileProfile.id, input.id))
        .returning();
      return toPublic(firstRow(rows));
    }),

  /** Clear backoff bookkeeping. Does not touch `status` (revive = `update`). */
  resetFailures: updateProfiles.input(idInput).mutation(async ({ input }) => {
    await requireProfile(input.id);
    const rows = await db
      .update(mobileProfile)
      .set({
        failureCount: 0,
        cooldownUntil: null,
        failureReason: null,
        failedAt: null,
        ...bumpRevision,
      })
      .where(eq(mobileProfile.id, input.id))
      .returning();
    return toPublic(firstRow(rows));
  }),

  /** Mirror of the worker's `markDataAuthFailure`: next scan re-mints. */
  evictBearer: updateProfiles.input(idInput).mutation(async ({ input }) => {
    await requireProfile(input.id);
    const rows = await db
      .update(mobileProfile)
      .set({
        accessToken: null,
        accessTokenExpiresAt: null,
        failureReason: "bearer evicted by admin".slice(0, FAILURE_REASON_MAX),
        ...bumpRevision,
      })
      .where(eq(mobileProfile.id, input.id))
      .returning();
    return toPublic(firstRow(rows));
  }),

  /** Bulk `evictBearer`: one statement, same fence bump per row. */
  evictBearerMany: updateProfiles
    .input(idsInput)
    .mutation(async ({ input }) => {
      const rows = await db
        .update(mobileProfile)
        .set({
          accessToken: null,
          accessTokenExpiresAt: null,
          failureReason: "bearer evicted by admin".slice(0, FAILURE_REASON_MAX),
          ...bumpRevision,
        })
        .where(inArray(mobileProfile.id, input.ids))
        .returning({ id: mobileProfile.id });
      return { count: rows.length };
    }),

  /**
   * Every bearer the database clock calls expired. Scoped by `app` when given
   * so the fleet view's app tab and this action agree on what "expired" covers.
   */
  evictExpiredBearers: updateProfiles
    .input(z.object({ app: z.string().min(1).optional() }))
    .mutation(async ({ input }) => {
      const rows = await db
        .update(mobileProfile)
        .set({
          accessToken: null,
          accessTokenExpiresAt: null,
          failureReason: "bearer evicted by admin".slice(0, FAILURE_REASON_MAX),
          ...bumpRevision,
        })
        .where(
          and(
            bearerStateWhere(["expired"]),
            input.app === undefined
              ? undefined
              : eq(mobileProfile.app, input.app)
          )
        )
        .returning({ id: mobileProfile.id });
      return { count: rows.length };
    }),

  /** Bulk `resetFailures`. */
  resetFailuresMany: updateProfiles
    .input(idsInput)
    .mutation(async ({ input }) => {
      const rows = await db
        .update(mobileProfile)
        .set({
          failureCount: 0,
          cooldownUntil: null,
          failureReason: null,
          failedAt: null,
          ...bumpRevision,
        })
        .where(inArray(mobileProfile.id, input.ids))
        .returning({ id: mobileProfile.id });
      return { count: rows.length };
    }),

  /**
   * Bulk `delete`: one statement over ids the table already listed. Returns the
   * numbers it removed, and the box each row was assigned to, so the caller
   * can name what is now left without a persona — the rows are gone by then
   * and nothing else can tell it.
   */
  deleteMany: deleteProfiles.input(idsInput).mutation(async ({ input }) => {
    const rows = await db
      .delete(mobileProfile)
      .where(inArray(mobileProfile.id, input.ids))
      .returning({
        app: mobileProfile.app,
        assignedWorker: mobileProfile.assignedWorker,
        id: mobileProfile.id,
      });
    return { count: rows.length, deleted: rows };
  }),

  delete: deleteProfiles.input(idInput).mutation(async ({ input }) => {
    const rows = await db
      .delete(mobileProfile)
      .where(eq(mobileProfile.id, input.id))
      .returning({ id: mobileProfile.id });
    return firstRow(rows);
  }),
});
