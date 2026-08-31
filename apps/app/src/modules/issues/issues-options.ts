import type { SelectConfig } from "@sparkyidea/dataview/types";

export const ISSUE_TYPE_OPTIONS: SelectConfig["options"] = [
  { value: "cancellation", name: "Cancellation", color: "red" },
  { value: "return", name: "Return", color: "pink" },
  { value: "refund", name: "Refund", color: "yellow" },
  { value: "replacement", name: "Replacement", color: "blue" },
  { value: "warranty", name: "Warranty", color: "purple" },
  { value: "claim", name: "Claim", color: "gray" },
];

export const ISSUE_STATUS_OPTIONS: SelectConfig["options"] = [
  { value: "open", name: "Open", color: "red" },
  { value: "under_review", name: "Under Review", color: "yellow" },
  { value: "approved", name: "Approved", color: "blue" },
  { value: "rejected", name: "Rejected", color: "gray" },
  { value: "resolved", name: "Resolved", color: "green" },
  { value: "escalated", name: "Escalated", color: "red-subtle" },
];

export const ISSUE_RESOLUTION_OPTIONS: SelectConfig["options"] = [
  { value: "refunded", name: "Refunded", color: "green" },
  { value: "replaced", name: "Replaced", color: "blue" },
  { value: "repaired", name: "Repaired", color: "blue" },
  { value: "denied", name: "Denied", color: "red" },
  { value: "credited", name: "Credited", color: "purple" },
  { value: "cancelled", name: "Cancelled", color: "gray" },
];
