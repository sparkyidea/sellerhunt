import { describe, expect, it } from "bun:test";
import { hasAdminRole, parseRoles } from "../roles";

describe("parseRoles", () => {
  it("splits comma-separated roles and trims whitespace", () => {
    expect(parseRoles("user, admin ,")).toEqual(["user", "admin"]);
  });
  it("returns an empty list for null, undefined and empty strings", () => {
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles("")).toEqual([]);
  });
});

describe("hasAdminRole", () => {
  it("accepts admin alone or among other roles", () => {
    expect(hasAdminRole("admin")).toBe(true);
    expect(hasAdminRole("user,admin")).toBe(true);
    expect(hasAdminRole(" admin ")).toBe(true);
  });
  it("rejects missing, empty and look-alike roles", () => {
    expect(hasAdminRole(null)).toBe(false);
    expect(hasAdminRole("")).toBe(false);
    expect(hasAdminRole("user")).toBe(false);
    expect(hasAdminRole("administrator")).toBe(false);
  });
});
