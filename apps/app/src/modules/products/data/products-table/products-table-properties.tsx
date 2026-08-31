import type {
  category,
  listing,
  product,
  productVariant,
} from "@dashseller/db/schema";
import { FilesMediaProperty } from "@sparkyidea/dataview/properties";
import type { DataViewProperty } from "@sparkyidea/dataview/types";

type FlattenToArrays<T> = { [K in keyof T]: T[K][] };
type Product = typeof product.$inferSelect;
export type ProductRow = Product & {
  productVariants: FlattenToArrays<typeof productVariant.$inferSelect>;
  listings: FlattenToArrays<typeof listing.$inferSelect>;
  category: FlattenToArrays<typeof category.$inferSelect>;
};

export const productsTableProperties = [
  {
    name: "Product",
    type: "formula",
    value: (_property, item) => {
      const imageUrl = item.imageUrls?.[0];
      return (
        <div className="flex items-center gap-2">
          {imageUrl && <FilesMediaProperty value={imageUrl} />}
          <span>{item.title}</span>
        </div>
      );
    },
    size: 300,
  },
  {
    name: "Variants",
    type: "formula",
    value: (_property, item) => {
      const count = item.productVariants?.id?.length ?? 0;
      return <span>{count}</span>;
    },
  },
  {
    key: "condition",
    name: "Condition",
    type: "text",
  },
  {
    key: "category.name",
    name: "Category",
    type: "rollup",
    config: { type: "text", calculation: "showOriginal" },
  },
  {
    key: "listings.id",
    name: "Listings",
    type: "rollup",
    config: { type: "number", calculation: "countAll" },
  },
] as DataViewProperty<ProductRow>[];
