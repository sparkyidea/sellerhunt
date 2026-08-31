import type { listing, listingVariant } from "@dashseller/db/schema";
import type { DataViewProperty } from "@sparkyidea/dataview/types";

type FlattenToArrays<T> = { [K in keyof T]: T[K][] };
type Listing = typeof listing.$inferSelect & {
  listingVariants: FlattenToArrays<typeof listingVariant.$inferSelect>;
};

export const listingsGalleryProperties = [
  {
    key: "condition",
    name: "Condition",
    type: "select",
    config: {
      options: [
        { value: "New", name: "New", color: "green-subtle" },
        {
          value: "New/Factory Sealed",
          name: "New / Factory Sealed",
          color: "green-subtle",
        },
        {
          value: "New with tags",
          name: "New with tags",
          color: "green-subtle",
        },
        { value: "Like New", name: "Like New", color: "teal-subtle" },
        {
          value: "Seller Refurbished",
          name: "Seller Refurbished",
          color: "blue-subtle",
        },
        {
          value: "Manufacturer Refurbished",
          name: "Manufacturer Refurbished",
          color: "blue-subtle",
        },
        { value: "Used", name: "Used", color: "yellow-subtle" },
        {
          value: "For parts or not working",
          name: "For parts or not working",
          color: "red-subtle",
        },
      ],
    },
  },
  {
    key: "title",
    name: "Title",
    type: "text",
  },
  {
    name: "Sales",
    type: "formula",
    value: (_property, item) => {
      const prices = item.listingVariants?.price ?? [];
      if (prices.length === 0) {
        return null;
      }
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const fmt = (v: number) =>
        (v / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        });
      return (
        <div className="flex w-full justify-between">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Price</span>
            <span>{min === max ? fmt(min) : `${fmt(min)} - ${fmt(max)}`}</span>
          </div>
        </div>
      );
    },
  },
  {
    name: "Inventory",
    type: "formula",
    value: (_property, item) => {
      const variantCount = item.listingVariants?.id?.length ?? 0;
      if (variantCount === 0) {
        return null;
      }
      const totalQuantity =
        item.listingVariants?.quantity?.reduce(
          (sum: number, q: number) => sum + q,
          0
        ) ?? 0;
      return (
        <div className="flex w-full justify-between">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Inventory</span>
            <span
              className={
                totalQuantity === 0
                  ? "text-badge-red-subtle-foreground"
                  : "text-badge-green-subtle-foreground"
              }
            >
              {totalQuantity === 0
                ? "Out of stock"
                : `${totalQuantity} in stock`}
            </span>
          </div>
          {variantCount > 1 && (
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground text-xs">Variants</span>
              <span>{variantCount}</span>
            </div>
          )}
        </div>
      );
    },
  },
  {
    key: "listingVariants.price",
    name: "Price",
    type: "rollup",
    config: {
      type: "number",
      calculation: "showOriginal",
      numberFormat: "dollar",
      decimalPlaces: 2,
      scale: 100,
    },
    hidden: true,
    enableSort: false,
    enableGroup: false,
  },
  {
    key: "listingVariants.quantity",
    name: "Stock",
    type: "rollup",
    config: { type: "number", calculation: "sum" },
    hidden: true,
  },
  {
    key: "listingVariants.sold",
    name: "Sold",
    type: "rollup",
    config: { type: "number", calculation: "sum" },
    showName: true,
    hidden: true,
  },

  {
    key: "imageUrls",
    name: "Images",
    type: "filesMedia",
    hidden: true,
  },
  {
    key: "status",
    name: "Status",
    type: "status",
    config: {
      groups: [
        {
          name: "Active",
          color: "green",
          options: ["active", "out_of_stock"],
        },
        {
          name: "Inactive",
          color: "yellow",
          options: ["draft", "inactive"],
        },
        {
          name: "Archived",
          color: "gray",
          options: ["sold", "ended", "archived"],
        },
      ],
    },
    hidden: true,
  },
] as DataViewProperty<Listing>[];
