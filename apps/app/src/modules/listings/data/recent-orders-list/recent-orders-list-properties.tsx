import type { DataViewProperty } from "@sparkyidea/dataview/types";
import { MarketplaceIcon } from "@/lib/utils/marketplace-icon";
import type { ListingRecentSoldOrderLine } from "@/modules/listings/types";

const formatDate = (date: Date | string | null) =>
  date ? new Date(date).toLocaleDateString() : "—";

export const recentOrdersListProperties = [
  {
    name: "Order",
    type: "formula",
    value: (_property, item) => (
      <div className="flex items-center gap-2">
        <MarketplaceIcon
          className="size-5 shrink-0"
          marketplaceId={item.order.channel?.marketplace?.id}
        />
        <div className="flex flex-col">
          <span className="text-sm">{item.order.reference}</span>
          <span className="text-muted-foreground text-xs">
            {formatDate(item.order.orderedAt)}
          </span>
        </div>
      </div>
    ),
    size: 150,
  },
  {
    key: "total",
    name: "Price",
    type: "number",
    config: {
      numberFormat: "dollar",
      decimalPlaces: 2,
      scale: 100,
    },
  },
] as DataViewProperty<ListingRecentSoldOrderLine>[];
