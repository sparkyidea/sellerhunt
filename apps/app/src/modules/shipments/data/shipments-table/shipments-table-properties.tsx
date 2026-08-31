import type {
  DataViewProperty,
  SelectConfig,
} from "@sparkyidea/dataview/types";
import { SquareArrowOutUpRight } from "lucide-react";
import { DynamicLink } from "@/components/layout/dynamic-link";
import { ORDER_STATUS_OPTIONS } from "@/modules/orders/orders-options";
import { getCarrierInfo, getTrackingUrl } from "../../shipping-carrier";
import { type TrackingStatus, titleCaseStatus } from "../../tracking-status";
import type { Shipment } from "../../types";

const TRACK_STATUS_COLOR = {
  pre_transit: "gray",
  transit: "blue",
  delivered: "green",
  returned: "yellow",
  failure: "red",
  unknown: "gray-subtle",
} as const satisfies Record<TrackingStatus, string>;

const TRACK_STATUS_OPTIONS: SelectConfig["options"] = (
  Object.keys(TRACK_STATUS_COLOR) as TrackingStatus[]
).map((value) => ({
  value,
  name: titleCaseStatus(value),
  color: TRACK_STATUS_COLOR[value],
}));

export const shipmentsTableProperties = [
  {
    name: "Customer",
    type: "formula",
    value: (_property, item) => {
      const name = item.order?.shippingName;
      const location = [
        item.order?.shippingCity,
        [item.order?.shippingState, item.order?.shippingZipCode]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(", ");

      return (
        <div>
          <span className="text-sm">{name}</span>
          {location && (
            <div className="text-muted-foreground text-xs">{location}</div>
          )}
        </div>
      );
    },
  },
  {
    key: "trackings.status",
    name: "Track Status",
    type: "rollup",
    config: {
      type: "select",
      calculation: "showOriginal",
      options: TRACK_STATUS_OPTIONS,
    },
  },
  {
    name: "Rate",
    type: "formula",
    value: (property, item) => {
      if (!item.labelUrl) {
        return <span>Fulfilled elsewhere</span>;
      }
      return property("shippingCost");
    },
  },
  {
    key: "shippingCost",
    name: "Shipping Cost",
    type: "number",
    hidden: true,
    config: { numberFormat: "dollar", decimalPlaces: 2, scale: 100 },
  },
  {
    name: "Carrier Service",
    type: "formula",
    value: (_property, item) => {
      const carrier = getCarrierInfo(item.carrier);
      const CarrierIcon = carrier.icon;
      const url = getTrackingUrl(item.carrier, item.tracking);

      return (
        <div className="flex items-center gap-2">
          <CarrierIcon className="size-5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">
              {item.carrier} {item.method}
            </span>
            {item.tracking && (
              <div>
                {url ? (
                  <DynamicLink
                    className="flex items-center gap-1 text-xs"
                    href={url}
                    onClick={(e) => e.stopPropagation()}
                    openInNewWindow
                  >
                    {item.tracking}
                    <SquareArrowOutUpRight className="h-3 w-3" />
                  </DynamicLink>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {item.tracking}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    name: "Order",
    type: "formula",
    value: (property, item) => {
      return (
        <div className="flex flex-col gap-1">
          <span className="text-sm">{item.order?.reference}</span>
          <div>{property("order.orderedAt")}</div>
        </div>
      );
    },
  },
  {
    key: "order.status",
    name: "Order Status",
    type: "select",
    hidden: true,
    config: { options: ORDER_STATUS_OPTIONS },
  },
  {
    key: "order.orderedAt",
    name: "Ordered At",
    type: "date",
    config: { dateFormat: "MM/DD/YYYY", timeFormat: "hidden" },
    hidden: true,
  },
  {
    key: "trackings.updatedAt",
    name: "Last Update",
    type: "rollup",
    config: {
      type: "date",
      calculation: "showOriginal",
      dateFormat: "MDY",
      timeFormat: "hidden",
    },
  },
] as DataViewProperty<Shipment>[];
