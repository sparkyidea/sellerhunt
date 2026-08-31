import { relations } from "drizzle-orm";
import { category } from "./category";
import { stock } from "./inventory";
import { listing } from "./listing";
import { product, productVariant } from "./product";

export const productRelations = relations(product, ({ many, one }) => ({
  productVariants: many(productVariant),
  listings: many(listing),
  category: one(category, {
    fields: [product.categoryId],
    references: [category.id],
  }),
}));

export const productVariantRelations = relations(
  productVariant,
  ({ one, many }) => ({
    product: one(product, {
      fields: [productVariant.productId],
      references: [product.id],
    }),
    stockItems: many(stock),
  })
);
