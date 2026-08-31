"use client";

import { SelectProperty } from "@sparkyidea/dataview/properties";
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
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { MarketplaceIcon } from "@/lib/utils/marketplace-icon";
import { useTRPC } from "@/lib/utils/trpc/client";
import { CustomerSection } from "../../components/customer-section";
import { NotesSection } from "../../components/notes-section";
import { OrderItemsSection } from "../../components/order-items-section";
import { PaymentSection } from "../../components/payment-section";
import { ShipmentsSection } from "../../components/shipments-section";
import { ORDER_STATUS_OPTIONS, PAYMENT_OPTIONS } from "../../orders-options";
import type { OrderData, OrderNeighbors } from "../../types";

function formatOrderDate(date: Date | string | null | undefined) {
  if (!date) {
    return null;
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getOrderActions(_order: OrderData): ActionItem[] {
  return [];
  // TODO: wire refund, cancel, etc when handlers exist
}

export function OrderDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: order } = useSuspenseQuery(
    trpc.order.getOne.queryOptions({ id })
  );
  const { data: neighbors } = useSuspenseQuery(
    trpc.order.getNeighbors.queryOptions({ id })
  );

  return (
    <>
      <OrderPageHeader neighbors={neighbors} order={order} />
      <OrderPanelContent order={order} />
    </>
  );
}

export function OrderPreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: order } = useSuspenseQuery(
    trpc.order.getOne.queryOptions({ id })
  );

  return (
    <>
      <OrderPreviewHeader onClose={onClose} order={order} />
      <OrderPanelContent order={order} />
    </>
  );
}

function OrderPageHeader({
  order,
  neighbors,
}: {
  order: OrderData;
  neighbors: OrderNeighbors;
}) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={order.reference} />
        <OrderStatusTags order={order} />
      </PanelHeader>
      <PanelAction>
        <MoreActions items={getOrderActions(order)} />
        <PanelNav
          next={
            neighbors.nextId ? (
              <Link href={`/orders/${neighbors.nextId}` as Route} />
            ) : undefined
          }
          prev={
            neighbors.prevId ? (
              <Link href={`/orders/${neighbors.prevId}` as Route} />
            ) : undefined
          }
        />
      </PanelAction>
    </PanelGroup>
  );
}

function OrderPreviewHeader({
  order,
  onClose,
}: {
  order: OrderData;
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand render={<Link href={`/orders/${order.id}` as Route} />} />
        <PanelAction>
          <MoreActions
            hidePinned
            items={getOrderActions(order)}
            variant="ghost"
          />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{order.reference}</PanelTitle>
          <OrderStatusTags order={order} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function OrderStatusTags({ order }: { order: OrderData }) {
  return (
    <PanelTags>
      <MarketplaceIcon
        className="size-6"
        marketplaceId={order.channel?.marketplace?.id ?? null}
      />
      <SelectProperty
        config={{ options: ORDER_STATUS_OPTIONS }}
        value={order.status ?? null}
      />
      <SelectProperty
        config={{ options: PAYMENT_OPTIONS }}
        value={order.paidAt ? "true" : "false"}
      />
    </PanelTags>
  );
}

function OrderPanelContent({ order }: { order: OrderData }) {
  const channelName = order.channel?.displayName;
  const formattedDate = formatOrderDate(order.orderedAt ?? order.createdAt);

  return (
    <PanelContent>
      {(formattedDate || channelName) && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {formattedDate && <span>{formattedDate}</span>}
          {channelName && (
            <>
              <span>from store:</span>
              <Badge size="sm" variant="blue">
                {channelName}
              </Badge>
            </>
          )}
        </div>
      )}
      <div className="@container">
        <div className="grid @3xl:grid-cols-12 grid-cols-1 gap-6">
          <div className="@3xl:col-span-9 flex min-w-0 flex-col gap-4">
            <OrderItemsSection order={order} />
            <PaymentSection order={order} />
            <ShipmentsSection order={order} />
          </div>
          <div className="@3xl:col-span-3 flex min-w-0 flex-col gap-4">
            <NotesSection order={order} />
            <CustomerSection order={order} />
          </div>
        </div>
      </div>
    </PanelContent>
  );
}
