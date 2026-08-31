import type { TabOption } from "@/components/dataview-tab";

export const ordersPresets: TabOption[] = [
  {
    label: "All",
    filter: null,
  },
  {
    label: "Pending",
    filter: [{ property: "status", condition: "inArray", value: ["pending"] }],
  },
  {
    label: "Unfulfilled",
    filter: [
      { property: "status", condition: "inArray", value: ["unfulfilled"] },
      {
        property: "issues.status",
        condition: "inArray",
        value: ["open"],
        quantifier: "none",
      },
    ],
    sort: [{ property: "orderedAt", direction: "desc" }],
  },
  {
    label: "Fulfilled",
    filter: [
      {
        property: "status",
        condition: "inArray",
        value: ["partially_fulfilled", "fulfilled"],
      },
    ],
  },
  {
    label: "Issues",
    filter: [
      {
        property: "issues.status",
        condition: "inArray",
        value: ["open"],
        quantifier: "any",
      },
    ],
  },
  {
    label: "Archived",
    filter: [
      {
        property: "status",
        condition: "inArray",
        value: ["completed", "canceled", "returned", "refunded"],
      },
    ],
  },
];
