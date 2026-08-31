import type { product, productVariant, stock } from "@dashseller/db/schema";

type FlattenToArrays<T> = { [K in keyof T]: T[K][] };
type Product = typeof product.$inferSelect;
type Stock = typeof stock.$inferSelect;

export type InventoryRow = typeof productVariant.$inferSelect & {
  product: FlattenToArrays<Product>;
  stockItems: FlattenToArrays<Stock>;
};
