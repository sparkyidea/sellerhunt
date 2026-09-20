import { describe, expect, it } from "bun:test";
import {
  getNavigationArea,
  getSettingsReturnLocation,
  isSettingsPath,
  SETTINGS_HOME,
} from "../navigation-area";

describe("navigation area", () => {
  it("distinguishes dashboard switches from settings navigation", () => {
    expect(getNavigationArea("/admin")).toBe("admin");
    expect(getNavigationArea("/admin/mobile-profiles/123")).toBe("admin");
    expect(getNavigationArea("/explorer/listings")).toBe("app");
    expect(getNavigationArea("/administrator")).toBe("app");
    for (const pathname of [
      "/settings",
      "/settings/account",
      "/settings/security",
      "/settings/appearance",
    ]) {
      expect(isSettingsPath(pathname)).toBe(true);
    }
    expect(isSettingsPath("/settings-other")).toBe(false);
  });

  it("captures the full origin, filters included, and maps it to its area", () => {
    const origin = getSettingsReturnLocation({
      pathname: "/admin/mobile-profiles",
      search: "?status=active",
      hash: "#top",
    });
    expect(origin).toBe("/admin/mobile-profiles?status=active#top");
    expect(getNavigationArea(origin)).toBe("admin");
    expect(
      getSettingsReturnLocation({
        pathname: "/explorer/listings",
        search: "?search=shoes",
        hash: "",
      })
    ).toBe("/explorer/listings?search=shoes");
  });

  it("closes to home in the app area when no origin is known", () => {
    expect(SETTINGS_HOME).toBe("/explorer/listings");
    expect(getNavigationArea(SETTINGS_HOME)).toBe("app");
  });
});
