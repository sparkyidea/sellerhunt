import { db } from "@dashseller/db";
import { warehouse } from "@dashseller/db/schema/warehouse";

export async function createDefaultWarehouse(organizationId: string) {
  try {
    await db.insert(warehouse).values({
      organizationId,
      address1: "Default Warehouse",
      city: "—",
      state: "—",
      zipcode: "—",
    });
  } catch (error) {
    console.error(
      "Failed to create default warehouse for organization:",
      organizationId,
      error
    );
  }
}
