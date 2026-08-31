import type {
  channel,
  issue,
  marketplace,
  order,
  orderLine,
  productVariant,
} from "@dashseller/db/schema";
import type { AppRouter } from "@dashseller/trpc/routers/index";
import type { inferProcedureOutput } from "@trpc/server";

export type OrderData = NonNullable<
  inferProcedureOutput<AppRouter["order"]["getOne"]>
>;

export type OrderNeighbors = inferProcedureOutput<
  AppRouter["order"]["getNeighbors"]
>;

type FlattenToArrays<T> = { [K in keyof T]: T[K][] };
type Marketplace = typeof marketplace.$inferSelect;
type Channel = typeof channel.$inferSelect & {
  marketplace: Marketplace;
};
type ProductVariant = typeof productVariant.$inferSelect;
type OrderLine = typeof orderLine.$inferSelect & {
  productVariant: ProductVariant | null;
};
type Issue = typeof issue.$inferSelect;

export type Order = typeof order.$inferSelect & {
  issues: FlattenToArrays<Issue>;
  channel: Channel | null;
  orderLines: FlattenToArrays<OrderLine>;
};
