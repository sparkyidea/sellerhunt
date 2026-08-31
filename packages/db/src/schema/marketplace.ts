import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const marketplace = pgTable("marketplace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),

  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),

  // Archive
  archived: boolean("archived").notNull().default(false),
});
