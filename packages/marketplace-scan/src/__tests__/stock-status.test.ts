import { expect, it } from "vitest";
import { stockStatus } from "../utils/stock-status";

it.each([
  [null, null, "in_stock"],
  [3, null, "in_stock"],
  [0, null, "out_of_stock"],
  [-1, null, "in_stock"],
  [0, true, "in_stock"],
  [5, false, "out_of_stock"],
  [null, false, "out_of_stock"],
] as const)("quantity %s with purchasable %s is %s", (quantity, availableForSale, expected) => {
  expect(stockStatus(quantity, availableForSale)).toBe(expected);
});
