/**
 * Role helpers for the better-auth `admin` plugin. Pure module: safe to import
 * from `packages/trpc` (server gate) and `apps/app` (layout gate) alike.
 * Role *membership* lives here; what a role may do is `permissions.ts`.
 *
 * better-auth stores `user.role` as a single string that may hold several
 * comma-separated roles (e.g. "user,admin").
 */
export const ADMIN_ROLE = "admin";

export function parseRoles(role: string | null | undefined): string[] {
  if (!role) {
    return [];
  }
  return role
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function hasAdminRole(role: string | null | undefined): boolean {
  return parseRoles(role).includes(ADMIN_ROLE);
}
