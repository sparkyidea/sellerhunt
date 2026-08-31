import type { TabOption } from "@/components/dataview-tab";

export const shipmentsPresets: TabOption[] = [
  {
    label: "All",
    filter: null,
  },
  {
    // Label generated (or imported) but not yet handed off to the carrier.
    label: "Pending",
    filter: [
      {
        property: "trackings.status",
        condition: "inArray",
        value: ["pre_transit"],
        quantifier: "any",
      },
    ],
  },
  {
    // Handed off to the carrier and not yet in a terminal state.
    // `trackings.status none [terminal]` excludes shipments whose
    // tracking row resolved to delivered/returned/failure. Pre-transit
    // and unknown states fall through to here — that's intentional: once
    // shippedAt is set, the shipment is in motion until it's clearly
    // resolved.
    label: "In Transit",
    filter: [
      {
        property: "trackings.status",
        condition: "inArray",
        value: ["transit"],
        quantifier: "any",
      },
    ],
  },
  {
    label: "Delivered",
    filter: [
      {
        property: "trackings.status",
        condition: "inArray",
        value: ["delivered"],
        quantifier: "any",
      },
    ],
  },
  {
    // Returned or failed — needs operator attention.
    label: "Issues",
    filter: [
      {
        property: "trackings.status",
        condition: "inArray",
        value: ["returned", "failure", "unknown"],
        quantifier: "any",
      },
    ],
  },
];
