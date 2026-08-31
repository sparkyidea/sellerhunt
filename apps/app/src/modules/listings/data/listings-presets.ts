import type { TabOption } from "@/components/dataview-tab";

export const listingsPresets: TabOption[] = [
  {
    label: "All",
    filter: null,
  },
  {
    label: "Active",
    filter: [{ property: "status", condition: "inArray", value: ["active"] }],
  },
  {
    label: "Draft",
    filter: [{ property: "status", condition: "inArray", value: ["draft"] }],
  },
  {
    label: "Archived",
    filter: [
      {
        property: "status",
        condition: "inArray",
        value: ["sold", "ended", "archived"],
      },
    ],
  },
];
