import type { Role } from "better-auth/plugins/access";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { parseRoles } from "./roles";

/**
 * Permission definitions for the better-auth `admin` plugin. Pure module:
 * `packages/trpc` (`permissionProcedure`) and the Next.js apps import it, the
 * server wires `admin({ ac, roles })`, the client `adminClient({ ac, roles })`.
 *
 * Shape: resource × CRUD verb. `defaultStatements` (`user`, `session`) stay
 * in so the admin UI plugin's ban / impersonate / set-role keep working.
 * Operational mutations on a resource (reset failures, evict a bearer,
 * replace credentials) are `update`.
 */
export const statement = {
  ...defaultStatements,
  mobileProfile: ["read", "create", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  admin: ac.newRole({
    ...adminAc.statements,
    mobileProfile: ["read", "create", "update", "delete"],
  }),
  user: ac.newRole({ user: [], session: [] }),
};

export type RoleName = keyof typeof roles;

/** A permission request: `{ mobileProfile: ["update"] }`. */
export type Permissions = Parameters<typeof roles.admin.authorize>[0];

/**
 * The role behind a name, or undefined. An own-property check, not a plain
 * lookup: `roles["constructor"]` would resolve to `Object`, and a role string
 * like that must deny, not throw.
 */
function roleFor(name: string): Role | undefined {
  return Object.hasOwn(roles, name) ? roles[name as RoleName] : undefined;
}

/**
 * True when any of the user's comma-separated roles grants every requested
 * action. Unknown roles grant nothing. Mirrors better-auth's internal
 * `hasPermission`, which the package does not export.
 */
export function hasPermission(
  role: string | null | undefined,
  permissions: Permissions
): boolean {
  return parseRoles(role).some(
    (name) => roleFor(name)?.authorize(permissions).success === true
  );
}
