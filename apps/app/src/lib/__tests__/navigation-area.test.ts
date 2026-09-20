import { describe, expect, it } from "bun:test";
import {
  getNavigationArea,
  getSettingsReturnLocation,
  SETTINGS_HOME,
} from "../navigation-area";

describe("navigation area", () => {
  it("maps admin paths to admin and everything else, settings included, to app", () => {
    expect(getNavigationArea("/admin")).toBe("admin");
    expect(getNavigationArea("/admin/mobile-profiles/123")).toBe("admin");
    expect(getNavigationArea("/explorer/listings")).toBe("app");
    expect(getNavigationArea("/administrator")).toBe("app");
    expect(getNavigationArea("/settings/account")).toBe("app");
  });

  it("captures the full origin, filters included", () => {
    expect(
      getSettingsReturnLocation({
        pathname: "/explorer/listings",
        search: "?search=shoes",
        hash: "#top",
      })
    ).toBe("/explorer/listings?search=shoes#top");
    expect(
      getSettingsReturnLocation({
        pathname: "/explorer/listings/123",
        search: "",
        hash: "",
      })
    ).toBe("/explorer/listings/123");
  });

  it("closes to home when no origin is known", () => {
    expect(SETTINGS_HOME).toBe("/explorer/listings");
  });
});
