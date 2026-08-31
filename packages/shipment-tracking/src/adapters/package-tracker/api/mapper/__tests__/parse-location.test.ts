import { describe, expect, it } from "vitest";
import { parsePackageTrackerLocation } from "../parse-location";

const EMPTY = {
  city: null,
  state: null,
  zip: null,
  country: null,
};

describe("parsePackageTrackerLocation", () => {
  it("parses USPS 'City, ST ZIP' shape", () => {
    expect(parsePackageTrackerLocation("ELLWOOD CITY, PA 16117")).toEqual({
      city: "ELLWOOD CITY",
      state: "PA",
      zip: "16117",
      country: null,
    });
  });

  it("parses UPS 'City, ST, Country' shape", () => {
    expect(parsePackageTrackerLocation("New York, NY, US")).toEqual({
      city: "New York",
      state: "NY",
      zip: null,
      country: "US",
    });
  });

  it("returns all-null for USPS facility strings (write-time resolver geocodes the raw string)", () => {
    expect(parsePackageTrackerLocation("METRO NY DISTRIBUTION CENTER")).toEqual(
      EMPTY
    );
    expect(
      parsePackageTrackerLocation("NEW YORK NY DISTRIBUTION CENTER")
    ).toEqual(EMPTY);
    expect(
      parsePackageTrackerLocation("PITTSBURGH PA DISTRIBUTION CENTER")
    ).toEqual(EMPTY);
  });

  it("returns all-null for an empty / null input", () => {
    expect(parsePackageTrackerLocation(null)).toEqual(EMPTY);
    expect(parsePackageTrackerLocation("")).toEqual(EMPTY);
    expect(parsePackageTrackerLocation("   ")).toEqual(EMPTY);
  });

  it("does not populate state when the slot isn't a 2-letter code", () => {
    expect(parsePackageTrackerLocation("Some Town, California 90001")).toEqual({
      city: "Some Town",
      state: null,
      zip: "90001",
      country: null,
    });
  });

  it("does not populate zip when the trailing token isn't a US ZIP", () => {
    expect(parsePackageTrackerLocation("Toronto, ON M5H 2N2")).toEqual({
      city: "Toronto",
      state: "ON",
      zip: null,
      country: null,
    });
  });
});
