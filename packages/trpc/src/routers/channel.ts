import { db } from "@dashseller/db";
import { channel, channelSyncState, channelToken } from "@dashseller/db/schema";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { orgProcedure, protectedProcedure, router } from "../index";
import { buildWhere, type RelationMap } from "../lib/build-filter";
import {
  buildGroupBy,
  buildGroupCursor,
  buildGroupWhere,
} from "../lib/build-group";
import { buildRollupExtras } from "../lib/build-rollup";
import { buildSearchFilter } from "../lib/build-search";
import { buildCursor } from "../lib/build-sort";
import { teardownChannelWebhooks } from "../lib/channel-teardown";
import {
  getGroupInput,
  getManyByColumnInput,
  getManyInput,
} from "../lib/schemas";

/**
 * Relation map for cross-table filtering on channels.
 */
const channelRelations: RelationMap = {};

export interface SyncRollup {
  syncedAt: Date | null;
  syncStatus: "error" | "success" | null;
}

/**
 * Cross-domain rollup from `channel_sync_state`, replacing the dropped
 * `channel.{syncStatus,syncedAt}` projection. Worst status wins so a single
 * failing domain (or an unresolved conflict, which sets `error` without
 * `status`) surfaces on the table; the watermark shown is the most recent
 * across domains. Computed post-pagination, so the table can't sort or
 * filter by these keys — buildWhere/buildCursor silently skip them.
 */
async function attachSyncRollup<T extends { id: string }>(
  items: T[]
): Promise<(T & SyncRollup)[]> {
  if (items.length === 0) {
    return [];
  }
  const states = await db
    .select({
      channelId: channelSyncState.channelId,
      error: channelSyncState.error,
      status: channelSyncState.status,
      syncedAt: channelSyncState.syncedAt,
    })
    .from(channelSyncState)
    .where(
      inArray(
        channelSyncState.channelId,
        items.map((item) => item.id)
      )
    );

  const byChannel = new Map<string, SyncRollup>();
  for (const state of states) {
    const rollup = byChannel.get(state.channelId) ?? {
      syncStatus: null,
      syncedAt: null,
    };
    if (state.status === "error" || state.error !== null) {
      rollup.syncStatus = "error";
    } else if (state.status === "success" && rollup.syncStatus !== "error") {
      rollup.syncStatus = "success";
    }
    if (
      state.syncedAt &&
      (!rollup.syncedAt || state.syncedAt > rollup.syncedAt)
    ) {
      rollup.syncedAt = state.syncedAt;
    }
    byChannel.set(state.channelId, rollup);
  }

  return items.map((item) => {
    const rollup = byChannel.get(item.id) ?? {
      syncStatus: null,
      syncedAt: null,
    };
    return { ...item, ...rollup };
  });
}

export const channelRouter = router({
  getList: orgProcedure.query(async ({ ctx }) => {
    return await db.query.channel.findMany({
      where: and(
        eq(channel.organizationId, ctx.organizationId),
        eq(channel.archived, false)
      ),
      with: { marketplace: true },
      columns: { id: true, displayName: true },
      orderBy: (channel, { asc }) => [asc(channel.displayName)],
    });
  }),

  /**
   * Lists every organization the current user belongs to, each with its
   * non-archived channels. Powers the merged channel switcher, which groups
   * channels by organization. Intentionally NOT `orgProcedure`-scoped: it spans
   * all of the user's memberships (navigation across orgs), not the single
   * active tenant. Selecting a result still switches the active organization
   * client-side, so per-tenant data isolation is preserved.
   */
  getGroupedByOrganization: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const memberships = await db.query.member.findMany({
      where: (m, { eq: equals }) => equals(m.userId, userId),
      columns: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);

    if (orgIds.length === 0) {
      return [];
    }

    const [organizations, channels] = await Promise.all([
      db.query.organization.findMany({
        where: (o, { inArray }) => inArray(o.id, orgIds),
        columns: { id: true, name: true, slug: true, logo: true },
        orderBy: (o, { asc }) => [asc(o.name)],
      }),
      db.query.channel.findMany({
        where: (c, { and: every, eq: equals, inArray }) =>
          every(inArray(c.organizationId, orgIds), equals(c.archived, false)),
        with: { marketplace: true },
        columns: { id: true, displayName: true, organizationId: true },
        orderBy: (c, { asc }) => [asc(c.displayName)],
      }),
    ]);

    return organizations.map((org) => ({
      organization: org,
      channels: channels.filter((c) => c.organizationId === org.id),
    }));
  }),

  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.channel.findFirst({
        where: and(
          eq(channel.id, input.id),
          eq(channel.organizationId, ctx.organizationId)
        ),
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Channel not found",
        });
      }

      return result;
    }),

  getMany: orgProcedure
    .input(getManyInput.extend({ archived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const {
        archived,
        cursor,
        limit,
        search,
        filter,
        sort,
        groupBy,
        rollups,
      } = input;

      const { after, before } = getCursorParams(cursor);

      // Scope to current organization and archived state
      const orgWhere = eq(channel.organizationId, ctx.organizationId);
      const archivedWhere = eq(channel.archived, archived);

      // Build WHERE from filters and search
      const filterWhere = buildWhere(
        channel,
        filter,
        channelRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        channel,
        searchQuery ? [searchQuery] : null,
        channelRelations
      );

      // Build group WHERE (for grouped views with row context)
      const groupWhere = groupBy
        ? (buildGroupWhere(channel, groupBy.type, groupBy.key) ?? undefined)
        : undefined;

      // Determine primary direction and append tiebreaker
      const primaryDirection = sort[0]?.direction ?? "desc";
      const sortWithTiebreaker = [
        ...sort,
        { property: "id", direction: primaryDirection } as const,
      ];

      // Cursor pagination
      const direction = before ? "backward" : "forward";
      const cursorId = after ?? before;
      const { orderBy, cursorWhere } = buildCursor(channel, {
        sort: sortWithTiebreaker,
        cursor: cursorId,
        direction,
      });

      const where = and(
        orgWhere,
        archivedWhere,
        filterWhere,
        searchWhere,
        groupWhere,
        cursorWhere
      );

      const extras =
        rollups.length > 0
          ? buildRollupExtras(channelRelations, rollups)
          : undefined;

      const items = await db.query.channel.findMany({
        where,
        orderBy,
        limit: limit + 1,
        extras,
      });

      const hasExtra = items.length > limit;
      if (hasExtra) {
        items.pop();
      }

      if (direction === "backward") {
        items.reverse();
      }

      const startCursor = items[0]?.id ?? null;
      const endCursor = items.at(-1)?.id ?? null;

      return {
        items: await attachSyncRollup(items),
        startCursor,
        endCursor,
        hasNextPage: direction === "forward" ? hasExtra : !!before,
        hasPreviousPage: direction === "backward" ? hasExtra : !!after,
      };
    }),

  getManyByColumn: orgProcedure
    .input(
      getManyByColumnInput.extend({ archived: z.boolean().default(false) })
    )
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loop with cursor handling requires conditionals
    .query(async ({ ctx, input }) => {
      const {
        archived,
        columnBy,
        limit,
        cursor: cursors,
        filter,
        sort,
        search,
        columnKeys: requestedColumnKeys,
        groupBy,
        rollups,
      } = input;

      // Scope to current organization and archived state
      const orgWhere = eq(channel.organizationId, ctx.organizationId);
      const archivedWhere = eq(channel.archived, archived);

      // Build common WHERE clauses
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        channel,
        searchQuery ? [searchQuery] : null,
        channelRelations
      );
      const filterWhere = buildWhere(
        channel,
        filter,
        channelRelations,
        rollups
      );

      // Build row-level group WHERE (for board views with row grouping)
      const rowGroupWhere = groupBy
        ? (buildGroupWhere(channel, groupBy.type, groupBy.key) ?? undefined)
        : undefined;

      // Prepare sort with tiebreaker
      const primaryDirection = sort?.[0]?.direction ?? "desc";
      const sortWithTiebreaker: typeof sort =
        sort && sort.length > 0
          ? [...sort, { property: "id", direction: primaryDirection }]
          : [
              { property: "createdAt", direction: "desc" },
              { property: "id", direction: "desc" },
            ];

      // Determine which columns to fetch
      let columnKeysToFetch: string[];

      if (requestedColumnKeys && requestedColumnKeys.length > 0) {
        columnKeysToFetch = requestedColumnKeys;
      } else {
        const groupByResult = buildGroupBy(channel, columnBy);

        if (!groupByResult) {
          return {
            items: [],
            startCursor: {},
            endCursor: {},
            hasNextPage: {},
            hasPreviousPage: {},
          };
        }

        const { groupKey: columnKeyExpr, orderBy } = groupByResult;

        const columnsResult = await db
          .selectDistinct({ columnKey: columnKeyExpr, sortValue: orderBy })
          .from(channel)
          .where(
            and(
              orgWhere,
              archivedWhere,
              filterWhere,
              searchWhere,
              rowGroupWhere
            )
          )
          .orderBy(orderBy);

        columnKeysToFetch = columnsResult.map((r) =>
          String(r.columnKey ?? `No ${columnBy.propertyId}`)
        );
      }

      // Fetch items for each column
      const allItems: (typeof channel.$inferSelect)[] = [];
      const startCursor: Record<string, string | null> = {};
      const endCursor: Record<string, string | null> = {};
      const hasNextPage: Record<string, boolean> = {};
      const hasPreviousPage: Record<string, boolean> = {};
      const seenIds = new Set<string>();

      for (const columnKey of columnKeysToFetch) {
        const cursor = cursors[columnKey];

        if (cursor === null) {
          startCursor[columnKey] = null;
          endCursor[columnKey] = null;
          hasNextPage[columnKey] = false;
          hasPreviousPage[columnKey] = true;
          continue;
        }

        const columnWhere = buildGroupWhere(channel, columnBy, columnKey);

        if (!columnWhere) {
          continue;
        }

        const { orderBy, cursorWhere } = buildCursor(channel, {
          sort: sortWithTiebreaker,
          cursor,
          direction: "forward",
        });

        const data = await db.query.channel.findMany({
          where: and(
            orgWhere,
            archivedWhere,
            filterWhere,
            searchWhere,
            cursorWhere,
            columnWhere,
            rowGroupWhere
          ),
          orderBy,
          limit: limit + 1,
          extras:
            rollups.length > 0
              ? buildRollupExtras(channelRelations, rollups)
              : undefined,
        });

        const hasMore = data.length > limit;
        const items = hasMore ? data.slice(0, -1) : data;
        const firstItem = items[0];
        const lastItem = items.at(-1);

        startCursor[columnKey] = firstItem ? String(firstItem.id) : null;
        endCursor[columnKey] = lastItem ? String(lastItem.id) : null;
        hasNextPage[columnKey] = hasMore;
        hasPreviousPage[columnKey] = !!cursor;

        for (const item of items) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            allItems.push(item);
          }
        }
      }

      return {
        items: await attachSyncRollup(allItems),
        startCursor,
        endCursor,
        hasNextPage,
        hasPreviousPage,
      };
    }),

  getGroup: orgProcedure
    .input(getGroupInput.extend({ archived: z.boolean().default(false) }))
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cursor + hideEmpty conditionals
    .query(async ({ ctx, input }) => {
      const {
        archived,
        filter,
        groupBy,
        hideEmpty,
        search,
        sort = "asc",
        limit,
        cursor,
        rollups,
      } = input;
      const groupByResult = buildGroupBy(channel, groupBy);
      if (!groupByResult) {
        return {
          counts: {},
          sortValues: {},
          nextCursor: null,
          hasNextPage: false,
        };
      }

      const { groupKey, orderBy } = groupByResult;
      const { orderByClause, cursorFilter } = buildGroupCursor({
        orderBy,
        cursor,
        sort,
      });

      // Scope to current organization and archived state
      const orgWhere = eq(channel.organizationId, ctx.organizationId);
      const archivedWhere = eq(channel.archived, archived);

      // Build filter/search conditions
      const filterCondition = buildWhere(
        channel,
        filter ?? undefined,
        channelRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        channel,
        searchQuery ? [searchQuery] : null,
        channelRelations
      );
      const whereCondition = and(
        orgWhere,
        archivedWhere,
        filterCondition,
        searchCondition
      );

      // Get paginated distinct values
      // When hideEmpty is true, apply whereCondition to exclude groups with no matching items
      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(channel);

      // Always scope to current organization + archived state for security;
      // when hideEmpty, also apply filter/search to exclude empty groups
      const distinctBase = hideEmpty
        ? whereCondition
        : and(orgWhere, archivedWhere);
      const distinctCondition = cursorFilter
        ? and(distinctBase, cursorFilter)
        : distinctBase;

      const distinctResults = await distinctQuery
        .where(distinctCondition)
        .orderBy(orderByClause)
        .limit(limit + 1);

      const hasNextPage = distinctResults.length > limit;
      const groups = hasNextPage
        ? distinctResults.slice(0, limit)
        : distinctResults;

      // Get filtered counts
      const countsResult = await db
        .select({ groupKey, count: count() })
        .from(channel)
        .where(whereCondition)
        .groupBy(groupKey);

      const countsMap = new Map<string, number>();
      for (const row of countsResult) {
        const key =
          row.groupKey instanceof Date
            ? row.groupKey.toISOString()
            : String(row.groupKey ?? `No ${groupBy.propertyId}`);
        countsMap.set(key, Number(row.count));
      }

      // Build output
      const counts: Record<string, { count: number; hasMore: boolean }> = {};
      const sortValues: Record<string, string | number> = {};

      for (const row of groups) {
        const key =
          row.groupKey instanceof Date
            ? row.groupKey.toISOString()
            : String(row.groupKey ?? `No ${groupBy.propertyId}`);
        const rawCount = countsMap.get(key) ?? 0;

        if (hideEmpty && rawCount === 0) {
          continue;
        }

        counts[key] = {
          count: Math.min(rawCount, 100),
          hasMore: rawCount > 100,
        };
        sortValues[key] =
          typeof row.sortValue === "number"
            ? row.sortValue
            : String(row.sortValue ?? key);
      }

      const lastGroup = groups.at(-1);
      const nextCursor =
        hasNextPage && lastGroup
          ? String(lastGroup.sortValue ?? lastGroup.groupKey)
          : null;

      return { counts, sortValues, nextCursor, hasNextPage };
    }),

  setEnabled: orgProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(channel)
        .set({ enabled: input.enabled, updatedAt: new Date() })
        .where(
          and(
            eq(channel.id, input.id),
            eq(channel.organizationId, ctx.organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Channel not found",
        });
      }

      return updated;
    }),

  archive: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(channel)
        .set({ archived: true, updatedAt: new Date() })
        .where(
          and(
            eq(channel.id, input.id),
            eq(channel.organizationId, ctx.organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Channel not found",
        });
      }

      return updated;
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await db.query.channel.findFirst({
        where: and(
          eq(channel.id, input.id),
          eq(channel.organizationId, ctx.organizationId)
        ),
        columns: {
          id: true,
          archived: true,
          marketplaceId: true,
          reference: true,
        },
      });

      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Channel not found",
        });
      }

      if (!target.archived) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Channel must be archived before it can be deleted",
        });
      }

      // Remote webhook teardown authenticates with the channel tokens, so
      // it must precede their deletion. Shopify's shopUrl is the channel
      // reference (the canonical storefront URL).
      await teardownChannelWebhooks({
        channelId: input.id,
        marketplaceId: target.marketplaceId,
        shopUrl: target.reference,
      });

      await db.delete(channelToken).where(eq(channelToken.channelId, input.id));
      await db.delete(channel).where(eq(channel.id, input.id));

      return { id: input.id };
    }),
});
