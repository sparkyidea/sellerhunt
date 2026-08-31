import type { AppRouter } from "@dashseller/trpc/routers/index";
import type { inferProcedureOutput } from "@trpc/server";

export type ListingData = NonNullable<
  inferProcedureOutput<AppRouter["listing"]["getOne"]>
>;

export type ListingNeighbors = inferProcedureOutput<
  AppRouter["listing"]["getNeighbors"]
>;

type RawOrderLineItem = inferProcedureOutput<
  AppRouter["orderLine"]["getMany"]
>["items"][number];

export type ListingRecentSoldOrderLine = Omit<RawOrderLineItem, "order"> & {
  order: NonNullable<RawOrderLineItem["order"]>;
};

export type ListingVariantData = NonNullable<
  inferProcedureOutput<AppRouter["listingVariant"]["getOne"]>
>;

export type ListingVariantNeighbors = inferProcedureOutput<
  AppRouter["listingVariant"]["getNeighbors"]
>;
