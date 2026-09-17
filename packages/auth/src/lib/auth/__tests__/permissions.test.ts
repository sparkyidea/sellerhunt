import { describe, expect, it } from "bun:test";
import { hasPermission, roles, statement } from "../permissions";

describe("statement", () => {
  it("keeps better-auth's user/session statements next to mobileProfile", () => {
    expect(Object.keys(statement)).toEqual(["user", "session", "mobileProfile"]);
    expect(statement.mobileProfile).toEqual([
      "read",
      "create",
      "update",
      "delete",
    ]);
  });
});

describe("roles", () => {
  it("admin holds every mobileProfile verb and the default admin grants", () => {
    expect(
      roles.admin.authorize({
        mobileProfile: ["read", "create", "update", "delete"],
      }).success
    ).toBe(true);
    expect(roles.admin.authorize({ user: ["ban", "set-role"] }).success).toBe(
      true
    );
    // Same exclusion as better-auth's default admin role.
    expect(
      roles.admin.authorize({ user: ["impersonate-admins"] }).success
    ).toBe(false);
  });
  it("user holds nothing", () => {
    expect(roles.user.authorize({ mobileProfile: ["read"] }).success).toBe(
      false
    );
    expect(roles.user.authorize({ user: ["list"] }).success).toBe(false);
  });
});

describe("hasPermission", () => {
  it("grants when any listed role authorizes every requested action", () => {
    expect(hasPermission("admin", { mobileProfile: ["update"] })).toBe(true);
    expect(hasPermission("user,admin", { mobileProfile: ["delete"] })).toBe(
      true
    );
    expect(
      hasPermission("admin", { mobileProfile: ["read"], user: ["ban"] })
    ).toBe(true);
  });
  it("denies missing, plain-user and unknown roles", () => {
    expect(hasPermission(null, { mobileProfile: ["read"] })).toBe(false);
    expect(hasPermission("", { mobileProfile: ["read"] })).toBe(false);
    expect(hasPermission("user", { mobileProfile: ["read"] })).toBe(false);
    expect(hasPermission("ops", { mobileProfile: ["read"] })).toBe(false);
    expect(hasPermission("administrator", { mobileProfile: ["read"] })).toBe(
      false
    );
  });
});
