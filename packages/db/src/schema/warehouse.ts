import {
  boolean,
  doublePrecision,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const warehouse = pgTable("warehouse", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  address1: text("address_1").notNull(),
  address2: text("address_2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipcode: text("zipcode").notNull(),
  country: text("country"),
  /** Geocoded from the full street address. Null until geocoded. */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
