import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

describe("admin access routing", () => {
  it("lets signed-out admin requests reach the server-side 404 gate", () => {
    for (const path of [
      "/admin",
      "/admin/mobile-profiles",
      "/admin/mobile-profiles/1",
    ]) {
      const response = proxy(new NextRequest(`http://localhost:3002${path}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("still sends signed-out visitors to sign-in for other protected paths", () => {
    for (const path of ["/explorer/listings", "/administrator"]) {
      const response = proxy(new NextRequest(`http://localhost:3002${path}`));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.pathname).toBe("/auth/sign-in");
      expect(location.searchParams.get("redirectTo")).toBe(path);
    }
  });
});
