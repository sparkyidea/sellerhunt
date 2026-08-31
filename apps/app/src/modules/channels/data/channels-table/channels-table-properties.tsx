import type { channel } from "@dashseller/db/schema";
import type { DataViewProperty } from "@sparkyidea/dataview/types";

// `syncStatus`/`syncedAt` are a router-computed rollup from
// `channel_sync_state`, not channel columns — display-only (sorting and
// filtering on them are silently skipped).
type Channel = typeof channel.$inferSelect & {
  syncStatus: "error" | "success" | null;
  syncedAt: Date | null;
};

export const channelsTableProperties = [
  {
    key: "id",
    name: "ID",
    type: "text",
    hidden: true,
  },
  {
    key: "displayName",
    name: "Name",
    type: "text",
  },
  {
    key: "reference",
    name: "Reference",
    type: "text",
    hidden: true,
  },
  {
    key: "marketplaceId",
    name: "Marketplace",
    type: "text",
  },
  {
    key: "countryId",
    name: "Country",
    type: "text",
  },
  {
    key: "connected",
    name: "Connected",
    type: "checkbox",
  },
  {
    key: "enabled",
    name: "Enabled",
    type: "checkbox",
  },
  {
    key: "syncStatus",
    name: "Sync Status",
    type: "text",
  },
  {
    key: "syncedAt",
    name: "Last Synced",
    type: "date",
  },
  {
    key: "createdAt",
    name: "Created",
    type: "date",
  },
] as DataViewProperty<Channel>[];
