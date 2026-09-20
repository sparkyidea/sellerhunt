import { afterEach, describe, expect, it } from "bun:test";
import { useSettingsOrigin } from "../use-settings-origin";

const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.window = originalWindow;
  useSettingsOrigin.setState({ returnTo: null });
});

describe("useSettingsOrigin", () => {
  it("starts empty, so a reload or fresh tab closes settings to home", () => {
    expect(useSettingsOrigin.getState().returnTo).toBeNull();
  });

  it("captures the current location with its filters when settings opens", () => {
    globalThis.window = {
      location: {
        pathname: "/explorer/listings",
        search: "?search=shoes",
        hash: "",
      },
    } as unknown as Window & typeof globalThis;
    useSettingsOrigin.getState().capture();
    expect(useSettingsOrigin.getState().returnTo).toBe(
      "/explorer/listings?search=shoes"
    );
  });
});
