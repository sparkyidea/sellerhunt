import {
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { zip } from "./world";

/**
 * Sales-tax rates by postal code. Sourced from Avalara's state-rate-downloader
 * for the US. One row per zip — when Avalara reports multiple overlapping
 * tax regions for the same ZIP, the seed collapses them to the maximum
 * combined rate (conservative over-collection).
 *
 * Stored as the combined rate only (decimal fraction, e.g. 0.06250 = 6.25%).
 */
export const taxRate = pgTable(
  "tax_rate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    zipId: text("zip_id")
      .notNull()
      .references(() => zip.id, { onDelete: "cascade" }),
    rate: numeric("rate", { precision: 8, scale: 6 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("tax_rate_zip_unique").on(t.zipId)]
);
