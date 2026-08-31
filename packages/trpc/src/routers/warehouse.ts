import { db } from "@dashseller/db";
import { warehouse } from "@dashseller/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { orgProcedure, router } from "../index";

export const warehouseRouter = router({
  /**
   * List the caller's non-archived warehouses, newest first. Used
   * by the shipment-create dialog's warehouse picker; selection
   * becomes `shipment.warehouseId` and prefills the ship-from
   * address + lat/lng inside the mutation.
   */
  list: orgProcedure.query(({ ctx }) => {
    const organizationId = ctx.organizationId;
    return db
      .select({
        id: warehouse.id,
        address1: warehouse.address1,
        address2: warehouse.address2,
        city: warehouse.city,
        state: warehouse.state,
        zipcode: warehouse.zipcode,
        country: warehouse.country,
      })
      .from(warehouse)
      .where(
        and(
          eq(warehouse.organizationId, organizationId),
          eq(warehouse.archived, false)
        )
      )
      .orderBy(desc(warehouse.createdAt));
  }),
});
