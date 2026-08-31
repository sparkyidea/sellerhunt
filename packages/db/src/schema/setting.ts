import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const settingUnitOfWeightEnum = pgEnum("weight_unit", [
  "kg", // kilograms (metric)
  "g", // grams (metric, for cooking/small items)
  "lbs", // pounds with decimal (e.g., 150.5 lbs)
  "lbs_oz", // pounds + ounces (e.g., 8 lbs 6 oz - common for babies)
]);

export const settingUnitOfMeasurementEnum = pgEnum("measurement_unit", [
  "cm", // centimeters (metric)
  "m", // meters (metric)
  "mm", // millimeters (precise measurements)
  "in", // inches only
  "ft_in", // feet + inches (e.g., 5'10" - common for height)
]);

export const setting = pgTable("setting", {
  id: text("id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  unitOfMeasurement: settingUnitOfMeasurementEnum("unit_of_measurement"),
  unitOfWeight: settingUnitOfWeightEnum("unit_of_weight"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
