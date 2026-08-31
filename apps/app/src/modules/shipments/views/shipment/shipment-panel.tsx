"use client";

import { Badge } from "@sparkyidea/ui/components/badge";
import {
  type ActionItem,
  MoreActions,
  PanelAction,
  PanelClose,
  PanelContent,
  PanelExpand,
  PanelGroup,
  PanelHeader,
  PanelNav,
  PanelTags,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { Separator } from "@sparkyidea/ui/components/separator";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { AddressBlock } from "@/components/ui/address-block";
import { useTRPC } from "@/lib/utils/trpc/client";
import { ItemsSummary } from "@/modules/shared/items-summary/items-summary";
import { titleCaseStatus } from "../../tracking-status";
import type { ShipmentData, ShipmentNeighbors } from "../../types";
import { ActivityTimeline } from "./activity-timeline";
import { STATUS_BADGE_VARIANT } from "./format";
import { ShippingDetails } from "./shipping-details";

function getShipmentTitle(shipment: ShipmentData): string {
  const orderReference = shipment.order?.reference ?? null;
  return orderReference ? `Order# ${orderReference}` : "Shipment";
}

function getShipmentActions(_shipment: ShipmentData): ActionItem[] {
  return [];
  // TODO: wire reprint label, void, etc when handlers exist
}

export function ShipmentDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: shipment } = useSuspenseQuery(
    trpc.shipment.getOne.queryOptions({ id })
  );
  const { data: neighbors } = useSuspenseQuery(
    trpc.shipment.getNeighbors.queryOptions({ id })
  );

  return (
    <>
      <ShipmentPageHeader neighbors={neighbors} shipment={shipment} />
      <ShipmentPanelContent shipment={shipment} />
    </>
  );
}

export function ShipmentPreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: shipment } = useSuspenseQuery(
    trpc.shipment.getOne.queryOptions({ id })
  );

  return (
    <>
      <ShipmentPreviewHeader onClose={onClose} shipment={shipment} />
      <ShipmentPanelContent shipment={shipment} />
    </>
  );
}

function ShipmentPageHeader({
  shipment,
  neighbors,
}: {
  shipment: ShipmentData;
  neighbors: ShipmentNeighbors;
}) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={getShipmentTitle(shipment)} />
        <ShipmentStatusTags shipment={shipment} />
      </PanelHeader>
      <PanelAction>
        <MoreActions items={getShipmentActions(shipment)} />
        <PanelNav
          next={
            neighbors.nextId ? (
              <Link href={`/shipments/${neighbors.nextId}` as Route} />
            ) : undefined
          }
          prev={
            neighbors.prevId ? (
              <Link href={`/shipments/${neighbors.prevId}` as Route} />
            ) : undefined
          }
        />
      </PanelAction>
    </PanelGroup>
  );
}

function ShipmentPreviewHeader({
  shipment,
  onClose,
}: {
  shipment: ShipmentData;
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand
          render={<Link href={`/shipments/${shipment.id}` as Route} />}
        />
        <PanelAction>
          <MoreActions
            hidePinned
            items={getShipmentActions(shipment)}
            variant="ghost"
          />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{getShipmentTitle(shipment)}</PanelTitle>
          <ShipmentStatusTags shipment={shipment} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function ShipmentStatusTags({ shipment }: { shipment: ShipmentData }) {
  const trackingStatus = shipment.trackings?.[0]?.status ?? null;
  if (!trackingStatus) {
    return null;
  }
  return (
    <PanelTags>
      <Badge variant={STATUS_BADGE_VARIANT[trackingStatus]}>
        {titleCaseStatus(trackingStatus)}
      </Badge>
    </PanelTags>
  );
}

function ShipmentPanelContent({ shipment }: { shipment: ShipmentData }) {
  // Tracking row only carries the coarse `status`; finer detail (substatus,
  // human-readable status text) lives on the latest tracking event.
  // `getOne` returns events ordered by `statusDate` desc, so index 0 is
  // the newest.
  const tracking = shipment.trackings?.[0];

  return (
    <PanelContent>
      {shipment.shipmentLines.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-xs">Items</div>
          <ItemsSummary
            countBadge={shipment.shipmentLines.reduce(
              (sum, line) => sum + line.quantity,
              0
            )}
            items={shipment.shipmentLines.map((line) => ({
              imageUrl: line.orderLine.imageUrl ?? null,
              title: line.orderLine.title ?? "",
              quantity: line.quantity,
            }))}
          />
        </div>
      )}

      <Separator />

      <ShippingDetails
        carrier={shipment.carrier}
        method={shipment.method}
        packageHeight={shipment.packageHeight}
        packageLength={shipment.packageLength}
        packageWidth={shipment.packageWidth}
        tracking={shipment.tracking}
        weight={shipment.weight}
      />

      <Separator />
      <div className="flex flex-wrap gap-1">
        <div className="flex flex-1 flex-col gap-1">
          <div className="font-semibold text-xs">Ship From</div>
          <AddressBlock
            address1={shipment.shipFromAddress1}
            address2={shipment.shipFromAddress2}
            city={shipment.shipFromCity}
            name={shipment.shipFromName}
            state={shipment.shipFromState}
            zipCode={shipment.shipFromZipcode}
          />
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <div className="font-semibold text-xs">Ship To</div>
          <AddressBlock
            address1={
              shipment.shipToAddress1 ?? shipment.order?.shippingAddress1
            }
            address2={
              shipment.shipToAddress2 ?? shipment.order?.shippingAddress2
            }
            city={shipment.shipToCity ?? shipment.order?.shippingCity}
            name={shipment.shipToName ?? shipment.order?.shippingName}
            state={shipment.shipToState ?? shipment.order?.shippingState}
            zipCode={shipment.shipToZipcode ?? shipment.order?.shippingZipCode}
          />
        </div>
      </div>
      <Separator />

      <ActivityTimeline events={tracking?.events ?? null} shipment={shipment} />
    </PanelContent>
  );
}
