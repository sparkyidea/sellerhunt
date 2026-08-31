import type {
  trackingStatusEnum,
  trackingSubstatusEnum,
} from "@dashseller/db/schema";

export type TrackingStatus = (typeof trackingStatusEnum.enumValues)[number];
export type TrackingSubstatus =
  (typeof trackingSubstatusEnum.enumValues)[number];

export function titleCaseStatus(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
