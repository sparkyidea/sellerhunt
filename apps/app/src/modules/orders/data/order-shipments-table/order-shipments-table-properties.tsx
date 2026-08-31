import type { shipment } from "@dashseller/db/schema";
import type { DataViewProperty } from "@sparkyidea/dataview/types";
import { toast } from "sonner";
import {
  getCarrierInfo,
  getTrackingUrl,
} from "@/modules/shipments/shipping-carrier";

type Shipment = typeof shipment.$inferSelect;

const SHIPMENT_STATUS_OPTIONS = [
  { value: "pending", name: "Pending", color: "yellow" },
  { value: "label_purchased", name: "Label Purchased", color: "gray" },
  { value: "picked_up", name: "Picked Up", color: "blue-subtle" },
  { value: "in_transit", name: "In Transit", color: "blue" },
  { value: "out_for_delivery", name: "Out for Delivery", color: "purple" },
  { value: "delivered", name: "Delivered", color: "green" },
  { value: "delivery_failed", name: "Delivery Failed", color: "red" },
  { value: "returned_to_sender", name: "Returned to Sender", color: "orange" },
  { value: "cancelled", name: "Cancelled", color: "gray-subtle" },
];

export const orderShipmentsTableProperties = [
  {
    name: "Shipping Label",
    type: "formula",
    value: (_property, item) => {
      const carrier = getCarrierInfo(item.carrier);
      const CarrierIcon = carrier.icon;
      const trackingUrl = getTrackingUrl(item.carrier, item.tracking);

      return (
        <div className="flex items-center gap-2">
          <CarrierIcon className="size-5 shrink-0" />
          <div className="flex flex-col">
            <span className="line-clamp-1">
              {carrier.label} {item.method}
            </span>
            {item.tracking && (
              <div>
                {trackingUrl ? (
                  <a
                    className="flex items-center gap-1 text-muted-foreground text-xs underline"
                    href={trackingUrl}
                    onClick={(e) => e.stopPropagation()}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {item.tracking}
                  </a>
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
    size: 220,
  },
  {
    key: "status",
    name: "Status",
    type: "select",
    config: { options: SHIPMENT_STATUS_OPTIONS },
  },
  {
    key: "createdAt",
    name: "Created Date",
    type: "date",
    config: { dateFormat: "MM/DD/YYYY", timeFormat: "hidden" },
  },
  {
    key: "shippingCost",
    name: "Cost",
    type: "number",
    config: { numberFormat: "dollar", decimalPlaces: 2, scale: 100 },
  },
  {
    name: "Package",
    type: "formula",
    value: (_property, item) => {
      if (!item.packageName) {
        return null;
      }
      const dimensions = [
        item.packageLength,
        item.packageWidth,
        item.packageHeight,
      ]
        .filter(Boolean)
        .join(" × ");
      return (
        <div className="flex flex-col">
          <span>{item.packageName}</span>
          {dimensions && (
            <span className="text-muted-foreground text-xs">
              {dimensions} inches
            </span>
          )}
        </div>
      );
    },
  },
  {
    key: "weight",
    name: "Weight",
  },
  {
    name: "Actions",
    type: "button",
    value: (item) => [
      {
        label: "View Label",
        disabled: !item.labelUrl,
        onClick: () => toast.info("Viewing:"),
      },
    ],
  },
] as DataViewProperty<Shipment>[];
