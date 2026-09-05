import { expect, it } from "vitest";
import {
  assertScanEntitySupported,
  supportsScanEntity,
} from "../scan-capabilities";

it("supports every entity on eBay and listing detail only on shop", () => {
  expect(supportsScanEntity("ebay", "listing")).toBe(true);
  expect(supportsScanEntity("ebay", "seller")).toBe(true);
  expect(supportsScanEntity("ebay", "keyword")).toBe(true);
  expect(supportsScanEntity("shop", "listing")).toBe(true);
  expect(supportsScanEntity("shop", "seller")).toBe(false);
  expect(supportsScanEntity("shop", "keyword")).toBe(false);
});

it("refuses parent work for unsupported adapters and unknown marketplaces", () => {
  expect(() => assertScanEntitySupported("shop", "seller")).toThrow(
    'Marketplace "shop" has no seller scan adapter'
  );
  expect(() => assertScanEntitySupported("ebay", "keyword")).not.toThrow();
  expect(() => supportsScanEntity("unknown", "listing")).toThrow(
    "Unsupported scan marketplace: unknown"
  );
});
