import type { TabOption } from "@/components/dataview-tab";

export const issuesPresets: TabOption[] = [
  {
    label: "All",
    filter: null,
  },
  {
    label: "Open",
    filter: [{ property: "status", condition: "inArray", value: ["open"] }],
  },
  {
    label: "Under Review",
    filter: [
      { property: "status", condition: "inArray", value: ["under_review"] },
    ],
  },
  {
    label: "Resolved",
    filter: [{ property: "status", condition: "inArray", value: ["resolved"] }],
  },
  {
    label: "Cancellations",
    filter: [
      { property: "type", condition: "inArray", value: ["cancellation"] },
    ],
  },
  {
    label: "Returns",
    filter: [{ property: "type", condition: "inArray", value: ["return"] }],
  },
];
