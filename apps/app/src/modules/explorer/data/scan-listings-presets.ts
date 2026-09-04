import type { TabOption } from "@sparkyidea/dataview/preset-tabs";

export const scanListingsPresets: TabOption[] = [
  {
    label: "All",
    filter: null,
  },
  {
    label: "1000+ sold",
    filter: [{ property: "itemSold", condition: "gte", value: 1000 }],
  },
  {
    label: "500–1000 sold",
    filter: [
      {
        and: [
          { property: "itemSold", condition: "gte", value: 500 },
          { property: "itemSold", condition: "lt", value: 1000 },
        ],
      },
    ],
  },
  {
    label: "100–500 sold",
    filter: [
      {
        and: [
          { property: "itemSold", condition: "gte", value: 100 },
          { property: "itemSold", condition: "lt", value: 500 },
        ],
      },
    ],
  },
  {
    label: "<100 sold",
    filter: [{ property: "itemSold", condition: "lt", value: 100 }],
  },
];
