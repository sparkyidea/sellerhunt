import type { DataViewProperty } from "@sparkyidea/dataview/types";
import { MarketplaceIcon } from "@/lib/utils/marketplace-icon";
import type { ProductData } from "../../types";

type Listing = ProductData["listings"][number];

export const linkedListingsListProperties = [
  {
    name: "Listing",
    type: "formula",
    value: (_property, item) => (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <MarketplaceIcon
          className="size-5 shrink-0"
          marketplaceId={item.channel?.marketplaceId}
        />
        {item.channel?.reference ? (
          <span className="truncate">{item.channel.displayName}</span>
        ) : null}
        <span className="truncate text-muted-foreground">
          {item.reference ?? item.id}
        </span>
      </div>
    ),
    size: 400,
  },
] as DataViewProperty<Listing>[];
