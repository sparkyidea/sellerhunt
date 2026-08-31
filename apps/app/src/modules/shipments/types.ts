import type {
  order,
  shipment,
  shipmentLine,
  tracking,
} from "@dashseller/db/schema";
import type { AppRouter } from "@dashseller/trpc/routers/index";
import type { inferProcedureOutput } from "@trpc/server";

export type ShipmentData = NonNullable<
  inferProcedureOutput<AppRouter["shipment"]["getOne"]>
>;

export type ShipmentNeighbors = inferProcedureOutput<
  AppRouter["shipment"]["getNeighbors"]
>;

type FlattenToArrays<T> = { [K in keyof T]: T[K][] };

type Order = typeof order.$inferSelect;
type ShipmentLine = typeof shipmentLine.$inferSelect;
type Tracking = typeof tracking.$inferSelect;

/**
 * Shape returned from `shipment.getMany`. `shipmentLines` and `trackings`
 * are eager-loaded then flattened by `flattenRelationArrays` (in the trpc
 * router) to enable dot-notation rollup keys like `trackings.status` from
 * dataview properties — so each relation field becomes an array.
 */
export type Shipment = typeof shipment.$inferSelect & {
  order: Order | null;
  shipmentLines: FlattenToArrays<ShipmentLine>;
  trackings: FlattenToArrays<Tracking>;
};
