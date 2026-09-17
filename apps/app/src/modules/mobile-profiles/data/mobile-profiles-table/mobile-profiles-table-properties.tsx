import type { DataViewProperty } from "@sparkyidea/dataview/types";
import type { MobileProfileRow } from "../../types";

/**
 * The single admin list over `mobile_profile`, led by the token cache: what
 * state each persona's bearer is in and when it runs out, with the lifecycle
 * columns (status, failures, cooldown) alongside. Grouping is off everywhere
 * (no `getGroup` procedure), and sorting is off for the derived `bearerState`
 * — the router filters it in SQL but has no column to order by.
 */
export const mobileProfilesTableProperties = [
  { key: "id", name: "#", type: "number", enableGroup: false },
  {
    key: "assignedWorker",
    name: "Worker",
    type: "text",
    enableSearch: true,
    enableGroup: false,
  },
  {
    key: "app",
    name: "App",
    type: "select",
    config: {
      options: [
        { value: "ebay", name: "eBay", color: "blue-subtle" },
        { value: "shop", name: "Shopify", color: "green-subtle" },
      ],
    },
    enableGroup: false,
  },
  {
    key: "bearerState",
    name: "Bearer",
    type: "status",
    config: {
      groups: [
        { name: "Valid", options: ["valid"], color: "green-subtle" },
        { name: "Expiring", options: ["expiring"], color: "yellow-subtle" },
        { name: "Expired", options: ["expired"], color: "red-subtle" },
        { name: "No bearer", options: ["none"], color: "gray-subtle" },
      ],
    },
    enableSort: false,
    enableGroup: false,
  },
  {
    key: "accessTokenExpiresAt",
    name: "Expires",
    type: "date",
    config: { dateFormat: "relative" },
    enableGroup: false,
  },
  {
    key: "refreshTokenExpiresAt",
    name: "Refresh expires",
    type: "date",
    config: { dateFormat: "relative" },
    enableGroup: false,
  },
  {
    key: "lastSuccessAt",
    name: "Last success",
    type: "date",
    config: { dateFormat: "relative" },
    enableGroup: false,
  },
  {
    key: "status",
    name: "Status",
    type: "status",
    config: {
      groups: [
        { name: "Active", options: ["active"], color: "green-subtle" },
        { name: "Dead", options: ["dead"], color: "red-subtle" },
      ],
    },
    enableGroup: false,
  },
  {
    key: "cooldownUntil",
    name: "Cooldown until",
    type: "date",
    config: { dateFormat: "relative" },
    enableGroup: false,
  },
  { key: "failureCount", name: "Failures", type: "number", enableGroup: false },
  {
    key: "failureReason",
    name: "Failure reason",
    type: "text",
    enableGroup: false,
    hidden: true,
  },
  {
    key: "createdAt",
    name: "Created",
    type: "date",
    config: { dateFormat: "short" },
    enableGroup: false,
    hidden: true,
  },
  { key: "revision", name: "Rev", type: "number", enableGroup: false },
  {
    key: "hasRefreshToken",
    name: "Refresh token",
    type: "checkbox",
    enableFilter: false,
    enableSort: false,
    enableGroup: false,
    hidden: true,
  },
] as DataViewProperty<MobileProfileRow>[];
