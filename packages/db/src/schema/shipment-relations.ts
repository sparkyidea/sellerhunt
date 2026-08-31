import { relations } from "drizzle-orm";
import { order, orderLine } from "./order";
import { packagePreset, shipment, shipmentLine } from "./shipment";
import { tracking } from "./tracking";

export const shipmentRelations = relations(shipment, ({ one, many }) => ({
  order: one(order, {
    fields: [shipment.orderId],
    references: [order.id],
  }),
  packagePreset: one(packagePreset, {
    fields: [shipment.packagePresetId],
    references: [packagePreset.id],
  }),
  shipmentLines: many(shipmentLine),
  trackings: many(tracking),
}));

export const shipmentLineRelations = relations(shipmentLine, ({ one }) => ({
  shipment: one(shipment, {
    fields: [shipmentLine.shipmentId],
    references: [shipment.id],
  }),
  orderLine: one(orderLine, {
    fields: [shipmentLine.orderLineId],
    references: [orderLine.id],
  }),
}));
