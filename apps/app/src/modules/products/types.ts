import type { productVariant } from "@dashseller/db/schema";
import type { AppRouter } from "@dashseller/trpc/routers/index";
import type { inferProcedureOutput } from "@trpc/server";

export type ProductData = NonNullable<
  inferProcedureOutput<AppRouter["product"]["getOne"]>
>;

export type ProductNeighbors = inferProcedureOutput<
  AppRouter["product"]["getNeighbors"]
>;

export type ProductVariantData = NonNullable<
  inferProcedureOutput<AppRouter["productVariant"]["getOne"]>
>;

export type ProductVariantNeighbors = inferProcedureOutput<
  AppRouter["productVariant"]["getNeighbors"]
>;

export type VariantBase = typeof productVariant.$inferSelect;
