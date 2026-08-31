"use client";

import {
  MapControls,
  MapMarker,
  MapRoute,
  Map as MapView,
  MarkerContent,
  MarkerTooltip,
  useMap,
} from "@sparkyidea/ui/components/map";
import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTRPC } from "@/lib/utils/trpc/client";
import { titleCaseStatus } from "../../tracking-status";
import type { TrackingEvent } from "./format";

interface ResolvedPoint {
  events: TrackingEvent[];
  latitude: number;
  longitude: number;
}

// Newest-first input → one ResolvedPoint per distinct (lng, lat) (rounded to
// ~11 m). Consecutive scans at the same city are collapsed so we don't pile
// markers on top of each other; the newest scan at each point comes first.
function groupEventsByLocation(events: TrackingEvent[]): ResolvedPoint[] {
  const seen = new Map<string, ResolvedPoint>();
  for (const event of events) {
    if (event.latitude == null || event.longitude == null) {
      continue;
    }
    const key = `${event.longitude.toFixed(4)},${event.latitude.toFixed(4)}`;
    const existing = seen.get(key);
    if (existing) {
      existing.events.push(event);
    } else {
      seen.set(key, {
        latitude: event.latitude,
        longitude: event.longitude,
        events: [event],
      });
    }
  }
  return Array.from(seen.values());
}

function eventTooltip(event: TrackingEvent): string {
  const label = event.substatus ?? event.status;
  return [label ? titleCaseStatus(label) : null, event.location]
    .filter(Boolean)
    .join(" — ");
}

function FitMapToPoints({ points }: { points: [number, number][] }) {
  const { map, isLoaded } = useMap();
  // Stable dependency so the effect re-runs when the point set actually
  // changes, not on every render.
  const key = points.map((p) => `${p[0]},${p[1]}`).join("|");
  // Track the last point set we fit to, so a theme toggle (which transitions
  // the map's `isLoaded` false→true again to let layers re-register after
  // setStyle) does NOT yank the user back to the initial bounds.
  const lastFitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!(isLoaded && map) || points.length === 0) {
      return;
    }
    if (lastFitKeyRef.current === key) {
      return;
    }
    lastFitKeyRef.current = key;
    if (points.length === 1) {
      map.jumpTo({ center: points[0], zoom: 9 });
      return;
    }
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, animate: false, maxZoom: 9 }
    );
  }, [isLoaded, map, key]);
  return null;
}

export function ShipmentMapPanel({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: shipment } = useSuspenseQuery(
    trpc.shipment.getOne.queryOptions({ id })
  );

  const tracking = shipment.trackings[0] ?? null;
  const events = tracking?.events ?? [];
  // Drive off the event stream — `tracking.status` can lag a poll behind.
  const isDelivered = events.some((e) => e.status === "delivered");

  const shipFrom: [number, number] | null =
    shipment.shipFromLongitude != null && shipment.shipFromLatitude != null
      ? [shipment.shipFromLongitude, shipment.shipFromLatitude]
      : null;
  const shipTo: [number, number] | null =
    shipment.shipToLongitude != null && shipment.shipToLatitude != null
      ? [shipment.shipToLongitude, shipment.shipToLatitude]
      : null;

  // Newest-first; index 0 is the package's current known location.
  const resolvedPoints = useMemo(() => groupEventsByLocation(events), [events]);

  // shipFrom → oldest scan → ... → newest scan → shipTo. Rendered as straight
  // segments between waypoints rather than a routed driving path.
  const waypoints: [number, number][] = useMemo(() => {
    const ordered: [number, number][] = [];
    if (shipFrom) {
      ordered.push(shipFrom);
    }
    for (let i = resolvedPoints.length - 1; i >= 0; i--) {
      const point = resolvedPoints[i];
      if (point) {
        ordered.push([point.longitude, point.latitude]);
      }
    }
    if (shipTo) {
      ordered.push(shipTo);
    }
    return ordered;
  }, [resolvedPoints, shipFrom, shipTo]);

  const fitPoints: [number, number][] = useMemo(() => {
    const all: [number, number][] = [];
    if (shipFrom) {
      all.push(shipFrom);
    }
    if (shipTo) {
      all.push(shipTo);
    }
    for (const point of resolvedPoints) {
      all.push([point.longitude, point.latitude]);
    }
    return all;
  }, [resolvedPoints, shipFrom, shipTo]);

  const latestPoint =
    !isDelivered && resolvedPoints[0] ? resolvedPoints[0] : null;
  const latestEvent = latestPoint?.events[0] ?? null;

  const hasEvents = events.length > 0;

  // Route + anchor color tracks shipment state: gray before the first scan,
  // blue while in transit, green once delivered.
  let stateColor: string;
  if (isDelivered) {
    stateColor = "#16a34a";
  } else if (hasEvents) {
    stateColor = "#2563eb";
  } else {
    stateColor = "#9ca3af";
  }

  return (
    <PanelProvider resizable>
      <Panel className="p-0">
        <MapView>
          <MapControls showZoom />
          {waypoints.length > 1 && (
            <MapRoute color={stateColor} coordinates={waypoints} width={4} />
          )}
          {shipFrom && (
            <MapMarker latitude={shipFrom[1]} longitude={shipFrom[0]}>
              <MarkerContent>
                <div
                  className="size-3.5 rounded-full border-2 bg-white shadow-lg"
                  style={{ borderColor: stateColor }}
                />
              </MarkerContent>
            </MapMarker>
          )}
          {shipTo && (
            <MapMarker latitude={shipTo[1]} longitude={shipTo[0]}>
              <MarkerContent>
                <div
                  className="size-3.5 rounded-full border-2 border-white shadow-lg"
                  style={{ backgroundColor: stateColor }}
                />
              </MarkerContent>
            </MapMarker>
          )}
          {latestPoint && latestEvent && (
            <MapMarker
              latitude={latestPoint.latitude}
              longitude={latestPoint.longitude}
            >
              <MarkerContent>
                <div className="rounded-full bg-badge-blue p-1.5 shadow-lg">
                  <Truck className="size-3 text-badge-blue-foreground" />
                </div>
                <MarkerTooltip>{eventTooltip(latestEvent)}</MarkerTooltip>
              </MarkerContent>
            </MapMarker>
          )}
          <FitMapToPoints points={fitPoints} />
        </MapView>
      </Panel>
    </PanelProvider>
  );
}
