import type { marketplace } from "@dashseller/db/schema";
import type { DataViewProperty } from "@sparkyidea/dataview/types";

type Marketplace = typeof marketplace.$inferSelect;

export const marketplacesGalleryProperties = [
  {
    key: "id",
    name: "ID",
    type: "text",
    hidden: true,
  },
  {
    key: "name",
    name: "Name",
    type: "text",
  },
  {
    key: "logoUrl",
    name: "Logo URL",
    type: "filesMedia",
  },
  {
    key: "enabled",
    name: "Enabled",
    type: "checkbox",
  },
] as DataViewProperty<Marketplace>[];
