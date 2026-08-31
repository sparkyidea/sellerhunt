import type { SelectConfig } from "@sparkyidea/dataview/types";

export const ORDER_STATUS_OPTIONS: SelectConfig["options"] = [
  { value: "pending", name: "Pending", color: "yellow" },
  { value: "unfulfilled", name: "Unfulfilled", color: "yellow" },
  { value: "partially_fulfilled", name: "Partially Fulfilled", color: "blue" },
  { value: "fulfilled", name: "Fulfilled", color: "gray-subtle" },
  { value: "completed", name: "Completed", color: "green" },
  { value: "canceled", name: "Canceled", color: "red" },
  { value: "returned", name: "Returned", color: "yellow" },
  { value: "refunded", name: "Refunded", color: "red" },
];

export const PAYMENT_OPTIONS: SelectConfig["options"] = [
  { value: "true", name: "Paid", color: "blue-subtle" },
  { value: "false", name: "Pending", color: "yellow-subtle" },
];

export const ISSUE_TYPE_OPTIONS: SelectConfig["options"] = [
  { value: "cancellation", name: "Cancellation", color: "red" },
  { value: "return", name: "Return", color: "red" },
  { value: "refund", name: "Refund", color: "red" },
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
  { value: "escalated", name: "Escalated", color: "yellow" },
];
