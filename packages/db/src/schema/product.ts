import { type SQL, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { tsvector } from "../utils/custom-types";
import { organization, user } from "./auth";
import { category } from "./category";

export const product = pgTable(
  "product",
  {
    // IDs
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => category.id),

    // Details
    title: text("title").notNull(),
    description: text("description"),
    brand: text("brand"),
    manufacturer: text("manufacturer"),
    condition: text("condition").notNull(),
    conditionNote: text("condition_note"),
    imageUrls: text("image_urls").array(),
    variant: boolean("variant").notNull().default(false),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    archived: boolean("archived").notNull().default(false),

    // Full-text search (generated column — auto-computed by PostgreSQL)
    search: tsvector("search").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${product.title}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${product.brand}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${product.manufacturer}, '')), 'B')
      `
    ),
  },
  (table) => [
    index("product_organization_id_idx").on(table.organizationId),
    index("product_category_id_idx").on(table.categoryId),
    index("product_created_at_idx").on(table.createdAt),
    index("product_search_idx").using("gin", table.search),
  ]
);

export const productVariant = pgTable(
  "product_variant",
  {
    // IDs
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),

    // Details
    sku: text("sku"),
    model: text("model"),
    upc: text("upc"),
    ean: text("ean"),
    isbn: text("isbn"),
    gtin: text("gtin"),
    attributes: jsonb("attributes").$type<Record<string, string>>(),
    unitCost: integer("unit_cost"), // cents
    price: integer("price").notNull(), // cents
    length: integer("length").notNull(), // millimeters
    width: integer("width").notNull(), // millimeters
    height: integer("height").notNull(), // millimeters
    weight: integer("weight").notNull(), // milligrams
    imageUrls: text("image_urls").array(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("product_variant_organization_id_idx").on(table.organizationId),
    index("product_variant_product_id_idx").on(table.productId),
    index("product_variant_sku_idx").on(table.sku),
    index("product_variant_upc_idx").on(table.upc),
    index("product_variant_ean_idx").on(table.ean),
    index("product_variant_isbn_idx").on(table.isbn),
    index("product_variant_gtin_idx").on(table.gtin),
  ]
);
