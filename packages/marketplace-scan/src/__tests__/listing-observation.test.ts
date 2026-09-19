import { expect, it } from "vitest";
import { variantPriceRange } from "../listing-observation";

it("computes a range including unknown-stock and sold-out variants, excluding removed ones", () => {
  expect(
    variantPriceRange([
      { price: 100, currency: "USD", status: null },
      { price: 200, currency: "USD", status: "out_of_stock" },
      { price: 1, currency: "USD", status: "removed" },
    ])
  ).toEqual({ priceMin: 100, priceMax: 200, currency: "USD" });
});

it.each(
  [
    [],
    [{ price: null, currency: "USD" }],
    [{ price: 10, currency: null }],
    [
      { price: 10, currency: "USD" },
      { price: 20, currency: "EUR" },
    ],
  ].map((variants) => ({ variants }))
)("withholds unknown or incomparable price ranges", ({ variants }) => {
  expect(variantPriceRange(variants)).toEqual({
    priceMin: null,
    priceMax: null,
    currency: null,
  });
});
