import { z } from "zod";
import { orgProcedure, router } from "../index";
import { contextSearch } from "../lib/context-search";

export const contextSearchRouter = router({
  query: orgProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(({ ctx, input }) =>
      contextSearch(ctx.organizationId, input.query, input.limit)
    ),
});
