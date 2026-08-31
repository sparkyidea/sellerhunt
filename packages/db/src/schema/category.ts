import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const category = pgTable("category", {
  // Rule: CAT-004 — this is Shopify's own taxonomy id ("aa-1-1"), not a
  // generated one, so a taxonomy refresh is an upsert and existing
  // mappings survive it.
  id: text("id").primaryKey(),
  parentId: text("parent_id").references((): AnyPgColumn => category.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  level: integer("level").notNull(),
  leaf: boolean("leaf").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const categoryRelations = relations(category, ({ one }) => ({
  parentCategory: one(category, {
    fields: [category.parentId],
    references: [category.id],
  }),
}));
