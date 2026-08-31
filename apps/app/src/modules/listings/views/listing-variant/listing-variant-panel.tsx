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
import { Icons } from "@sparkyidea/ui/icons";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useMemo } from "react";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { useTRPC } from "@/lib/utils/trpc/client";
import { ListingVariantMediaSection } from "../../components/listing-variant-media-section";
import { ListingVariantPricingSection } from "../../components/listing-variant-pricing-section";
import { ListingVariantProductSection } from "../../components/listing-variant-product-section";
import {
  RecentOrdersSection,
  RecentOrdersSectionSkeleton,
} from "../../components/recent-orders-section";
import type {
  ListingRecentSoldOrderLine,
  ListingVariantData,
  ListingVariantNeighbors,
} from "../../types";

function getVariantAttributeLabel(variant: ListingVariantData): string {
  return variant.attributes
    ? Object.values(variant.attributes).join(", ") || "Default"
    : "Default";
}

// Variant actions only carry the parent-listing link today. Returned as data
// so additional items (duplicate, delete) can be appended once handlers exist.
function getListingVariantActions(variant: ListingVariantData): ActionItem[] {
  return [
    {
      icon: <Icons.listing />,
      label: "View parent listing",
      pinned: true,
      render: <Link href={`/listings/${variant.listingId}` as Route} />,
    },
  ];
}

// Owns the suspense reads for the variant detail page. Header and content
// are pure presentational below so the same `variant` flows to both.
export function ListingVariantDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: variant } = useSuspenseQuery(
    trpc.listingVariant.getOne.queryOptions({ id })
  );
  const { data: neighbors } = useSuspenseQuery(
    trpc.listingVariant.getNeighbors.queryOptions({ id })
  );

  return (
    <>
      <ListingVariantPageHeader neighbors={neighbors} variant={variant} />
      <ListingVariantPanelContent variant={variant} />
    </>
  );
}

// Owns the suspense read for the side-preview pane rendered alongside the
// listing detail page. NOT_FOUND surfaces via PreviewPanel's error boundary.
export function ListingVariantPreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: variant } = useSuspenseQuery(
    trpc.listingVariant.getOne.queryOptions({ id })
  );

  return (
    <>
      <ListingVariantPreviewHeader onClose={onClose} variant={variant} />
      <ListingVariantPanelContent variant={variant} />
    </>
  );
}

function ListingVariantPageHeader({
  variant,
  neighbors,
}: {
  variant: ListingVariantData;
  neighbors: ListingVariantNeighbors;
}) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb
          currentLabel={getVariantAttributeLabel(variant)}
          parentLabel={variant.listing.title}
        />
        {variant.sku && (
          <PanelTags>
            <Badge variant="secondary">SKU: {variant.sku}</Badge>
          </PanelTags>
        )}
      </PanelHeader>
      <PanelAction>
        <MoreActions items={getListingVariantActions(variant)} />
        <PanelNav
          next={
            neighbors.nextId ? (
              <Link
                href={
                  `/listings/${variant.listingId}/variants/${neighbors.nextId}` as Route
                }
              />
            ) : undefined
          }
          prev={
            neighbors.prevId ? (
              <Link
                href={
                  `/listings/${variant.listingId}/variants/${neighbors.prevId}` as Route
                }
              />
            ) : undefined
          }
        />
      </PanelAction>
    </PanelGroup>
  );
}

function ListingVariantPreviewHeader({
  variant,
  onClose,
}: {
  variant: ListingVariantData;
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand
          render={
            <Link
              href={
                `/listings/${variant.listingId}/variants/${variant.id}` as Route
              }
            />
          }
        />
        <PanelAction>
          <MoreActions
            hidePinned
            items={getListingVariantActions(variant)}
            variant="ghost"
          />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{getVariantAttributeLabel(variant)}</PanelTitle>
          {variant.sku && (
            <PanelTags>
              <Badge variant="secondary">SKU: {variant.sku}</Badge>
            </PanelTags>
          )}
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function ListingVariantPanelContent({
  variant,
}: {
  variant: ListingVariantData;
}) {
  const trpc = useTRPC();
  const { data: recentSold } = useQuery(
    trpc.orderLine.getMany.queryOptions({
      filter: [
        {
          property: "listingVariant.id",
          condition: "inArray",
          value: [variant.id],
        },
      ],
      sort: [{ property: "createdAt", direction: "desc" }],
      limit: 5,
    })
  );

  const recentSoldOrderLines = useMemo(
    () =>
      recentSold?.items.filter(
        (line): line is ListingRecentSoldOrderLine => line.order !== null
      ) ?? [],
    [recentSold]
  );

  return (
    <PanelContent>
      <div className="@container">
        <div className="grid @3xl:grid-cols-7 grid-cols-1 gap-6">
          <div className="@3xl:col-span-5 flex min-w-0 flex-col gap-6">
            <ListingVariantMediaSection variant={variant} />
            <ListingVariantPricingSection variant={variant} />
          </div>
          <div className="@3xl:col-span-2 flex min-w-0 flex-col gap-6">
            <ListingVariantProductSection variant={variant} />
            {recentSold ? (
              <RecentOrdersSection orderLines={recentSoldOrderLines} />
            ) : (
              <RecentOrdersSectionSkeleton />
            )}
          </div>
        </div>
      </div>
    </PanelContent>
  );
}
