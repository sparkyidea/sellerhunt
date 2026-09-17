import { describe, expect, it } from "bun:test";
import { parseProfileId } from "../constants";

describe("parseProfileId", () => {
  it("accepts a positive integer segment", () => {
    expect(parseProfileId("12")).toBe(12);
    expect(parseProfileId("1")).toBe(1);
  });

  it("rejects anything that is not the whole number", () => {
    for (const raw of ["12foo", "12.9", "12e3", "0", "-3", "+4", " 12", ""]) {
      expect(parseProfileId(raw)).toBeNaN();
    }
  });
});
