import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineHeading,
  TimelineItem,
  TimelineLine,
} from "@sparkyidea/ui/components/timeline";
import { titleCaseStatus } from "../../tracking-status";
import type { ShipmentData } from "../../types";
import {
  formatShipFromShort,
  formatShipToShort,
  type TrackingEvent,
} from "./format";

function formatTime(date: Date) {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatEventLabel(event: TrackingEvent) {
  const value = event.substatus ?? event.status;
  return value ? titleCaseStatus(value) : "—";
}

function EventRow({
  event,
  variant,
}: {
  event: TrackingEvent;
  variant: "delivered" | "current" | "past";
}) {
  const location = event.location;
  const dotClass = {
    delivered: "border-badge-green bg-badge-green",
    current: "border-badge-blue bg-badge-blue",
    past: "border-badge-gray bg-badge-gray",
  }[variant];
  return (
    <TimelineItem
      className="gap-x-0"
      status={variant === "past" ? "default" : "done"}
    >
      <TimelineDot className={dotClass} status="default" />
      <TimelineLine className="min-h-10" />
      <TimelineHeading className="flex w-full items-center justify-between gap-2 text-wrap pl-4 font-medium text-sm">
        <span>{formatEventLabel(event)}</span>
        <span className="text-nowrap font-normal text-muted-foreground text-xs">
          {formatTime(new Date(event.statusDate))}
        </span>
      </TimelineHeading>
      <TimelineContent className="self-start pb-3 pl-4">
        <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
          {location && <span>{location}</span>}
          {event.statusDetails && <span>{event.statusDetails}</span>}
        </div>
      </TimelineContent>
    </TimelineItem>
  );
}

// "Delivered" tail row rendered only when no carrier delivered event has
// landed yet — always in the unfinished/uncolored state, since the real
// delivered scan replaces it once it arrives.
function DeliveredAnchor({ shipToText }: { shipToText: string }) {
  return (
    <TimelineItem className="gap-x-0" status="default">
      <TimelineDot status="default" />
      <TimelineLine className="min-h-10" />
      <TimelineHeading className="flex w-full items-center justify-between gap-2 text-wrap pl-4 font-medium text-sm">
        <span>Delivered</span>
      </TimelineHeading>
      <TimelineContent className="self-start pb-3 pl-4">
        <div className="text-muted-foreground text-xs">{shipToText || "—"}</div>
      </TimelineContent>
    </TimelineItem>
  );
}

function DispatchAnchor({
  shipFromText,
  hasEvents,
}: {
  shipFromText: string;
  hasEvents: boolean;
}) {
  return (
    <TimelineItem className="gap-x-0" status="default">
      <TimelineDot
        className={hasEvents ? "border-badge-gray bg-badge-gray" : undefined}
        status="default"
      />
      <TimelineHeading className="flex w-full items-center justify-between gap-2 text-wrap pl-4 font-medium text-sm">
        <span>Dispatched from warehouse</span>
      </TimelineHeading>
      <TimelineContent className="self-start pb-3 pl-4">
        <div className="text-muted-foreground text-xs">
          {shipFromText || "—"}
        </div>
      </TimelineContent>
    </TimelineItem>
  );
}

export function ActivityTimeline({
  events,
  shipment,
}: {
  events: TrackingEvent[] | null;
  shipment: ShipmentData;
}) {
  const realEvents = events ?? [];
  // Source of truth is the event stream, not the coarse `tracking.status`
  // rollup — the rollup can lag a poll behind. As long as any scan reports
  // delivered, the synthetic placeholder is replaced by that event row,
  // styled in green.
  const deliveredEvent =
    realEvents.find((e) => e.status === "delivered") ?? null;

  const shipToText = formatShipToShort(shipment);
  const shipFromText = formatShipFromShort(shipment);

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-xs">Activity</div>
      <Timeline>
        {!deliveredEvent && <DeliveredAnchor shipToText={shipToText} />}
        {realEvents.map((event, i) => {
          let variant: "delivered" | "current" | "past" = "past";
          if (event.id === deliveredEvent?.id) {
            variant = "delivered";
          } else if (!deliveredEvent && i === 0) {
            variant = "current";
          }
          return <EventRow event={event} key={event.id} variant={variant} />;
        })}
        <DispatchAnchor
          hasEvents={realEvents.length > 0}
          shipFromText={shipFromText}
        />
      </Timeline>
    </div>
  );
}
