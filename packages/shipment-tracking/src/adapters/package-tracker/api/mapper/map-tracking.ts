import type { Tracking, TrackingEvent } from "../../../../types";
import {
  convertPackageTrackerMilestone,
  refinePackageTrackerEventSubstatus,
} from "../../enums";
import type {
  PackageTrackerEvent,
  PackageTrackerTracking,
} from "../../raw-types";
import { parsePackageTrackerLocation } from "./parse-location";

const PACKAGE_TRACKER_PROVIDER = "package-tracker";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapEvent(event: PackageTrackerEvent): TrackingEvent | null {
  const statusDate = parseDate(event.datetime);
  if (!statusDate) {
    return null;
  }

  const { status } = convertPackageTrackerMilestone(event.statusMilestone);
  const substatus = refinePackageTrackerEventSubstatus(
    event.statusMilestone,
    event.status
  );
  const location = parsePackageTrackerLocation(event.location);

  return {
    reference: event.eventId,
    status,
    substatus,
    statusDetails: event.status || null,
    statusDate,
    location: event.location ?? null,
    locationCity: location.city,
    locationState: location.state,
    locationZip: location.zip,
    locationCountry: location.country,
  };
}

/**
 * Convert a Ship24 `tracking` envelope into a `Tracking` row payload.
 *
 * `trackingNumber` is passed through from the caller — Ship24 echoes a
 * normalized value on the tracker, but we keep the caller's original
 * string so the row's primary key stays stable across re-polls that
 * re-format the number.
 */
export function mapTracking(
  tracking: PackageTrackerTracking,
  trackingNumber: string
): Tracking {
  const events = tracking.events
    .map((event) => mapEvent(event))
    .filter((e): e is TrackingEvent => e !== null)
    .sort((a, b) => a.statusDate.getTime() - b.statusDate.getTime());

  const { status } = convertPackageTrackerMilestone(
    tracking.shipment.statusMilestone
  );

  return {
    provider: PACKAGE_TRACKER_PROVIDER,
    trackingNumber,
    serviceLevelToken: null,
    serviceLevelName: tracking.shipment.delivery.service ?? null,
    metadata: null,
    originalEta: null,
    eta: parseDate(tracking.shipment.delivery.estimatedDeliveryDate),
    status,
    history: events,
  };
}
