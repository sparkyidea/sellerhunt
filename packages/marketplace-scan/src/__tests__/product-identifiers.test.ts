import { expect, it } from "vitest";
import { extractProductIdentifiers } from "../utils/product-identifiers";

it("reads identity out of seller-typed specific names", () => {
  expect(
    extractProductIdentifiers({
      Brand: "Nintendo",
      "Manufacturer Part Number": "HAC-001",
      "Model Number": "Switch OLED",
      "UPC ": "045496883414",
      Color: "White",
    })
  ).toEqual({
    brand: "Nintendo",
    ean: null,
    gtin: null,
    isbn: null,
    manufacturer: null,
    model: "Switch OLED",
    mpn: "HAC-001",
    upc: "045496883414",
  });
});

it("treats a seller's placeholder as no identifier at all", () => {
  const identifiers = extractProductIdentifiers({
    UPC: "Does not apply",
    EAN: "N/A",
    Brand: "Unbranded",
    MPN: "  ",
  });
  expect(identifiers.upc).toBeNull();
  expect(identifiers.ean).toBeNull();
  expect(identifiers.brand).toBeNull();
  expect(identifiers.mpn).toBeNull();
});

it("keeps the value exactly as listed, without normalizing", () => {
  expect(extractProductIdentifiers({ GTIN: "0-45496-88341-4" }).gtin).toBe(
    "0-45496-88341-4"
  );
});

it("returns every field null for an absent or unrecognized bag", () => {
  const empty = {
    brand: null,
    ean: null,
    gtin: null,
    isbn: null,
    manufacturer: null,
    model: null,
    mpn: null,
    upc: null,
  };
  expect(extractProductIdentifiers(null)).toEqual(empty);
  expect(extractProductIdentifiers({ Character: "Mario" })).toEqual(empty);
});
