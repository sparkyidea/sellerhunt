import { publicProcedure, router } from "../index";
import { mobileProfileRouter } from "./mobile-profile";
import { scanListingRouter } from "./scan-listing";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  scanListing: scanListingRouter,
  mobileProfile: mobileProfileRouter,
});
export type AppRouter = typeof appRouter;
