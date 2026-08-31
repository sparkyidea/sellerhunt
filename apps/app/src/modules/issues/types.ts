import type { AppRouter } from "@dashseller/trpc/routers/index";
import type { inferProcedureOutput } from "@trpc/server";

export type IssueData = inferProcedureOutput<AppRouter["issue"]["getOne"]>;
export type IssueOrder = NonNullable<IssueData["order"]>;
