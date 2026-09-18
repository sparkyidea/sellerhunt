import { describe, expect, it } from "bun:test";
import {
  getNavigationArea,
  getSettingsReturnTo,
  isSettingsPath,
} from "../navigation-area";

describe("settings navigation context", () => {
  it("keeps the admin area through every settings tab and its return URL", () => {
    const from = "/admin/mobile-profiles?status=active";
    for (const pathname of [
      "/settings",
      "/settings/account",
      "/settings/security",
      "/settings/appearance",
    ]) {
      expect(isSettingsPath(pathname)).toBe(true);
      expect(getNavigationArea(getSettingsReturnTo(from))).toBe("admin");
    }
    expect(getSettingsReturnTo(from)).toBe(from);
  });

  it("distinguishes dashboard switches from settings navigation", () => {
    expect(getNavigationArea("/admin")).toBe("admin");
    expect(getNavigationArea("/admin/mobile-profiles/123")).toBe("admin");
    expect(getNavigationArea("/explorer/listings")).toBe("app");
    expect(getNavigationArea("/administrator")).toBe("app");
    expect(isSettingsPath("/settings-other")).toBe(false);
  });

  it("preserves explorer filters and rejects unsafe or unrelated return URLs", () => {
    const from = "/explorer/listings?search=shoes#results";
    expect(getSettingsReturnTo(from)).toBe(from);
    for (const invalid of [
      null,
      "",
      "https://example.com",
      "//example.com",
      "javascript:alert(1)",
      "/admin\\evil",
      "/settings/account",
      "/auth/sign-in",
      "explorer/listings",
      "admin",
    ]) {
      expect(getSettingsReturnTo(invalid)).toBe("/explorer/listings");
    }
  });

  it("allow-lists the normalized pathname so dot segments cannot escape a dashboard", () => {
    for (const escaping of [
      "/explorer/../auth/sign-in",
      "/admin/%2e%2e/settings/security",
      "/admin/.%2E/settings/security",
      "/admin/mobile-profiles/../../auth",
      "/admin%2Fx/../../y",
      "/explorer/..",
    ]) {
      expect(getSettingsReturnTo(escaping)).toBe("/explorer/listings");
    }
    expect(getSettingsReturnTo("/explorer/./listings?search=shoes")).toBe(
      "/explorer/listings?search=shoes"
    );
    expect(
      getSettingsReturnTo("/admin/mobile-profiles/../mobile-profiles")
    ).toBe("/admin/mobile-profiles");
  });
});
