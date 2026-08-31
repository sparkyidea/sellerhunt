import type { AppRouter } from "@dashseller/trpc/routers/index";
import type { inferProcedureOutput } from "@trpc/server";

export type ScanListingData = inferProcedureOutput<
  AppRouter["scanListing"]["get"]
>;

export type ScanListingVariantData = ScanListingData["variants"][number];

export type ScanSellerData = NonNullable<ScanListingData["seller"]>;
