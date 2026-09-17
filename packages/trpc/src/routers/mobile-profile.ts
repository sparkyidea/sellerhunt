import { db } from "@dashseller/db";
import { decryptSecret, encryptSecret } from "@dashseller/db/lib/secret-crypto";
import { mobileProfile, type SelectMobileProfile } from "@dashseller/db/schema";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { permissionProcedure, router } from "../index";
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
 * leave this file; credentials are encrypted on write with
 * `ctx.encryptionKey` and only an allowlist of identifiers is ever decrypted
 * for display.
 *
 * A persona's credentials and its box are fixed for the row's life: there is
 * no replace and no manual assignment. A capture that must change is deleted
 * and uploaded again; a box claims its own row. Status and failure
 * bookkeeping are the only admin writes, and they are not fenced against a
 * run in flight — the worker's writes are id-keyed and last-write-wins, and a
 * run whose row was deleted underneath it stops at its next write.
 */

/** The database-assigned profile number — the id everywhere, "#12" on screen. */
const profileId = z.number().int().positive();
const idInput = z.object({ id: profileId });
/** Bulk ops take ids the table already listed, so one page is the natural cap. */
const idsInput = z.object({ ids: z.array(profileId).min(1).max(100) });
/**
 * One capture entry as the bulk pane reads it: the file carries its own app
 * and the credentials, nothing else. The profile's number (`id`) comes from
 * the database, and no worker — upload never assigns; the next box without a
 * row for the app claims it.
 */
const entryInput = credentialsInputSchema;

/** A paste is one operator's capture batch, not an import job — one page of entries. */
const entriesInput = z.object({ entries: z.array(entryInput).min(1).max(100) });

/** A profile id as the dataview carries it in a cursor: digits only, int4 range. */
const PROFILE_CURSOR = /^[1-9]\d{0,9}$/;
const INT4_MAX = 2_147_483_647;

/**
 * `buildCursor` interpolates the cursor into `WHERE "id" = $n` against the
 * integer id, so anything but a profile id would surface as a Postgres cast
 * error (a 500) rather than the bad request it is — a stale or edited URL is
 * the usual source.
 */
function profileCursor(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!PROFILE_CURSOR.test(value) || Number(value) > INT4_MAX) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
  }
  return value;
}

/** Strip ciphertext columns; expose presence booleans instead. */
function toPublic(row: SelectMobileProfile) {
  const { credentials: _credentials, accessToken, refreshToken, ...rest } = row;
  return {
    ...rest,
    hasCachedBearer: accessToken !== null,
    hasRefreshToken: refreshToken !== null,
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
// Operational mutations — change status, reset failures — are `update`: they
// change the row's bookkeeping, never its identity or its credentials.
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
    const raw = getCursorParams(cursor);
    const after = profileCursor(raw.after);
    const before = profileCursor(raw.before);

    const filterWhere = buildWhere(mobileProfile, filter);
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
      where: and(filterWhere, searchWhere, cursorWhere, groupWhere),
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
   * Status only: revive a dead persona or retire an active one. `app`,
   * credentials and the box are immutable. Not fenced against a run in
   * flight: a scan already using the row finishes its run, and the next load
   * honours the new status (a dead row is never selected or claimed).
   */
  update: updateProfiles
    .input(idInput.extend({ status: mobileProfileStatusSchema }))
    .mutation(async ({ input }) => {
      await requireProfile(input.id);
      const rows = await db
        .update(mobileProfile)
        .set({ status: input.status })
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
      })
      .where(eq(mobileProfile.id, input.id))
      .returning();
    return toPublic(firstRow(rows));
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
