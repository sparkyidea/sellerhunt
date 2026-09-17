import { describe, expect, it } from "bun:test";
import { isUniqueViolation } from "@dashseller/db/lib/pg-errors";

describe("isUniqueViolation", () => {
  it("matches a bare pg error", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "idx" })).toBe(true);
    expect(isUniqueViolation({ code: "23505", constraint: "idx" }, "idx")).toBe(
      true
    );
  });
  it("walks the DrizzleQueryError cause chain", () => {
    const wrapped = new Error("Failed query");
    (wrapped as Error & { cause: unknown }).cause = {
      code: "23505",
      constraint: "mobile_profile_app_label_uidx",
    };
    expect(isUniqueViolation(wrapped, "mobile_profile_app_label_uidx")).toBe(
      true
    );
  });
  it("rejects other codes, other constraints and non-errors", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ code: "23505", constraint: "a" }, "b")).toBe(
      false
    );
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(new Error("plain"))).toBe(false);
  });
});
