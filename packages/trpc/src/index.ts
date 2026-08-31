import { db } from "@dashseller/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }

  // const { success } = await ratelimit.limit(user.id);

  // if (!success) {
  //   throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
  // }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

/**
 * Tenant-scoped procedure. Requires a session AND an active organization.
 * Resolves the organization from the session's `activeOrganizationId`
 * (set on session creation), falling back to the user's first membership.
 * Exposes `ctx.organizationId` (the tenant key every query scopes on) and
 * `ctx.userId` (for `createdByUserId` audit columns).
 *
 * Rule: TEN-001 — the organization is the tenant. `createdByUserId` is
 * attribution only and must never appear in an isolation predicate.
 * Business-data procedures build on this, not on `protectedProcedure`.
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  let organizationId = ctx.session.session.activeOrganizationId ?? null;

  if (!organizationId) {
    const membership = await db.query.member.findFirst({
      where: (m, { eq }) => eq(m.userId, ctx.session.user.id),
      columns: { organizationId: true },
    });
    organizationId = membership?.organizationId ?? null;
  }

  if (!organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      organizationId,
      userId: ctx.session.user.id,
    },
  });
});
