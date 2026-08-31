import { protectedProcedure, publicProcedure, router } from "../index";
import { categoryRouter } from "./category";
import { channelRouter } from "./channel";
import { contextSearchRouter } from "./context-search";
import { issueRouter } from "./issue";
import { listingRouter } from "./listing";
import { listingVariantRouter } from "./listing-variant";
import { marketplaceRouter } from "./marketplace";
import { marketplaceCategoryRouter } from "./marketplace-category";
import { orderRouter } from "./order";
import { orderLineRouter } from "./order-line";
import { productRouter } from "./product";
import { productVariantRouter } from "./product-variant";
import { scanListingRouter } from "./scan-listing";
import { shipmentRouter } from "./shipment";
import { stockRouter } from "./stock";
import { stockTransactionRouter } from "./stock-transaction";
import { syncRouter } from "./sync";
import { warehouseRouter } from "./warehouse";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  category: categoryRouter,
  channel: channelRouter,
  issue: issueRouter,
  listing: listingRouter,
  listingVariant: listingVariantRouter,
  marketplace: marketplaceRouter,
  marketplaceCategory: marketplaceCategoryRouter,
  scanListing: scanListingRouter,
  order: orderRouter,
  orderLine: orderLineRouter,
  product: productRouter,
  productVariant: productVariantRouter,
  shipment: shipmentRouter,
  stock: stockRouter,
  stockTransaction: stockTransactionRouter,
  sync: syncRouter,
  contextSearch: contextSearchRouter,
  warehouse: warehouseRouter,
});
export type AppRouter = typeof appRouter;
