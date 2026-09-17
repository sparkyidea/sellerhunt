import { describe, expect, it } from "bun:test";
import { AdminNavConfig } from "../admin-nav.config";
import { AppNavConfig } from "../app-nav.config";
import { getUserMenuLinks } from "../user-menu.config";

describe("admin navigation", () => {
  it("keeps admin destinations out of the regular sidebar", () => {
    const { appNavMain, appNavSecondary } = AppNavConfig();
    const urls = [
      ...appNavMain.flatMap((item) => [
        item.url,
        ...(item.items?.map((child) => child.url) ?? []),
      ]),
      ...appNavSecondary.map((item) => item.url),
    ];
    expect(urls.some((url) => url?.startsWith("/admin"))).toBe(false);
  });

  it("gives admin its own list and independently defined footer links", () => {
    const { appNavMain, appNavSecondary } = AdminNavConfig();
    expect(appNavMain.map((item) => item.url)).toEqual([
      "/admin/mobile-profiles",
    ]);
    expect(appNavSecondary.map((item) => item.title)).toEqual([
      "Help",
      "Settings",
    ]);
    expect(appNavSecondary.map((item) => item.url)).toEqual([
      "mailto:help@turboitem.com",
      "/settings",
    ]);
  });

  it("replaces the admin dashboard entry with Back to app inside admin", () => {
    expect(getUserMenuLinks({ role: "admin" }, "admin")).toMatchObject([
      {
        label: "Back to app",
        href: "/explorer/listings",
        visibility: "authenticated",
      },
    ]);
    expect(getUserMenuLinks({ role: "admin" }, "admin")).toHaveLength(1);
  });

  it("offers the avatar menu entry only to active admins", () => {
    for (const user of [
      undefined,
      null,
      { role: "user" },
      { role: "administrator" },
      { role: "admin", banned: true },
    ]) {
      expect(getUserMenuLinks(user)).toEqual([]);
    }
    for (const role of ["admin", "user, admin"]) {
      expect(getUserMenuLinks({ role })).toMatchObject([
        {
          label: "Admin dashboard",
          href: "/admin",
          visibility: "authenticated",
        },
      ]);
    }
  });
});
