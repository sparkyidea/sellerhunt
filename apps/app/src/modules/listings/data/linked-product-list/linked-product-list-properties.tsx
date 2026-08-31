import {
  FilesMediaProperty,
  TextProperty,
} from "@sparkyidea/dataview/properties";
import type { DataViewProperty } from "@sparkyidea/dataview/types";
import type { ListingData } from "@/modules/listings/types";

type LinkedProduct = NonNullable<ListingData["product"]>;

export const linkedProductListProperties = [
  {
    name: "Product",
    type: "formula",
    value: (_property, item) => {
      const imageUrl = item.imageUrls?.[0];
      return (
        <div className="flex items-center gap-3">
          {imageUrl && <FilesMediaProperty value={imageUrl} />}
          <TextProperty value={item.title} />
        </div>
      );
    },
  },
] as DataViewProperty<LinkedProduct>[];
