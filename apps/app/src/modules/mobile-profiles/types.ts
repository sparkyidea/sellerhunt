import type { AppRouter } from "@dashseller/trpc/routers/index";
import type { inferProcedureOutput } from "@trpc/server";

/** Detail shape: public columns + allowlisted identifiers. */
export type MobileProfileData = inferProcedureOutput<
  AppRouter["mobileProfile"]["get"]
>;

/** Table row shape (no identifiers). */
export type MobileProfileRow = inferProcedureOutput<
  AppRouter["mobileProfile"]["getMany"]
>["items"][number];
