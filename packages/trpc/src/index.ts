import {
  hasPermission,
  type Permissions,
} from "@dashseller/auth/lib/auth/permissions";
import { hasAdminRole } from "@dashseller/auth/lib/auth/roles";
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
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

/**
 * Session-gated **and** role-gated: any admin role, no statement check. Use
 * for "is an admin at all" surfaces; resource procedures should name what
 * they need via `permissionProcedure` instead.
 *
 * The better-auth `admin` plugin owns `user.role` / `user.banned`; these
 * procedures are the only authorization boundary — the Next.js proxies can
 * only see that a cookie exists.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const { user } = ctx.session;
  if (user.banned || !hasAdminRole(user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required",
    });
  }
  return next({ ctx });
});

/**
 * Session-gated **and** permission-gated against the access-control
 * statements in `@dashseller/auth/lib/auth/permissions`. Every listed action
 * must be granted by one of the user's roles.
 *
 *   const updateProfiles = permissionProcedure({ mobileProfile: ["update"] });
 *   evictBearer: updateProfiles.input(idInput).mutation(...)
 */
export function permissionProcedure(permissions: Permissions) {
  return protectedProcedure.use(({ ctx, next }) => {
    const { user } = ctx.session;
    if (user.banned || !hasPermission(user.role, permissions)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });
    }
    return next({ ctx });
  });
}
