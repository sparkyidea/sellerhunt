import { publicProcedure, router } from "../index";
import { scanListingRouter } from "./scan-listing";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  scanListing: scanListingRouter,
});
export type AppRouter = typeof appRouter;
