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
import { useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DynamicLink } from "@/components/layout/dynamic-link";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { useTRPC } from "@/lib/utils/trpc/client";
import { EbayListingForm } from "../../marketplace/ebay/ebay-listing-form";
import type { ListingData, ListingNeighbors } from "../../types";

const STATUS_LABELS: Record<ListingData["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  out_of_stock: "Out of stock",
  draft: "Draft",
  sold: "Sold",
  ended: "Ended",
};

const STATUS_VARIANTS: Record<
  ListingData["status"],
  "green" | "yellow" | "gray" | "red"
> = {
  active: "green",
  inactive: "yellow",
  out_of_stock: "yellow",
  draft: "yellow",
  sold: "gray",
  ended: "gray",
};

const MARKETPLACE_LABELS: Record<string, string> = {
  ebay: "eBay",
};

function getMarketplaceLabel(listing: ListingData): string {
  const marketplaceId = listing.channel?.marketplaceId;
  if (!marketplaceId) {
    return "marketplace";
  }
  return MARKETPLACE_LABELS[marketplaceId] ?? marketplaceId;
}

// Shared action set for the listing detail view. Returned as data so it
// composes through helpers and works with MoreActions's items-prop API.
function getListingActions(listing: ListingData): ActionItem[] {
  return [
    {
      icon: <ExternalLinkIcon />,
      label: `View on ${getMarketplaceLabel(listing)}`,
      pinned: true,
      render: <DynamicLink href={listing.url} openInNewWindow />,
    },
    // TODO: wire to duplicate mutation
    // {
    //   icon: <CopyIcon />,
    //   label: "Duplicate",
    //   onSelect: () => {},
    // },
    // TODO: wire to end-listing mutation
    // {
    //   icon: <BanIcon />,
    //   label: "End listing",
    //   onSelect: () => {},
    // },
  ];
}

// Owns the suspense reads for the route detail page. Header and content are
// pure presentational below so the same `listing` flows to both without
// duplicating the query.
export function ListingDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: listing } = useSuspenseQuery(
    trpc.listing.getOne.queryOptions({ id })
  );
  const { data: neighbors } = useSuspenseQuery(
    trpc.listing.getNeighbors.queryOptions({ id })
  );

  return (
    <>
      <ListingPageHeader listing={listing} neighbors={neighbors} />
      <ListingPanelContent listing={listing} />
    </>
  );
}

// Owns the suspense read for the side-preview pane. Missing IDs surface as
// a NOT_FOUND error caught by PreviewPanel's error boundary.
export function ListingPreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: listing } = useSuspenseQuery(
    trpc.listing.getOne.queryOptions({ id })
  );

  return (
    <>
      <ListingPreviewHeader listing={listing} onClose={onClose} />
      <ListingPanelContent listing={listing} />
    </>
  );
}

function ListingPageHeader({
  listing,
  neighbors,
}: {
  listing: ListingData;
  neighbors: ListingNeighbors;
}) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={listing.title} />
        <ListingStatusTags listing={listing} />
      </PanelHeader>
      <PanelAction>
        <MoreActions items={getListingActions(listing)} />
        <PanelNav
          next={
            neighbors.nextId ? (
              <Link href={`/listings/${neighbors.nextId}` as Route} />
            ) : undefined
          }
          prev={
            neighbors.prevId ? (
              <Link href={`/listings/${neighbors.prevId}` as Route} />
            ) : undefined
          }
        />
      </PanelAction>
    </PanelGroup>
  );
}

function ListingPreviewHeader({
  listing,
  onClose,
}: {
  listing: ListingData;
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand
          render={<Link href={`/listings/${listing.id}` as Route} />}
        />
        <PanelAction>
          <MoreActions
            hidePinned
            items={getListingActions(listing)}
            variant="ghost"
          />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{listing.title}</PanelTitle>
          <ListingStatusTags listing={listing} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function ListingStatusTags({ listing }: { listing: ListingData }) {
  return (
    <PanelTags>
      <Badge variant={STATUS_VARIANTS[listing.status]}>
        {STATUS_LABELS[listing.status]}
      </Badge>
    </PanelTags>
  );
}

function ListingPanelContent({ listing }: { listing: ListingData }) {
  const marketplaceId = listing.channel?.marketplaceId;

  if (marketplaceId !== "ebay") {
    return (
      <ListingPanelEmpty
        action={
          <Link
            className="text-primary text-sm hover:underline"
            href="/listings"
          >
            Back to listings
          </Link>
        }
        message={`Detail view for ${marketplaceId ?? "this marketplace"} is not available yet.`}
      />
    );
  }

  return (
    <PanelContent>
      <EbayListingForm id={listing.id} />
    </PanelContent>
  );
}

function ListingPanelEmpty({
  message,
  action,
}: {
  message: string;
  action: ReactNode;
}) {
  return (
    <PanelContent>
      <div className="flex flex-col items-center justify-center gap-2 py-20">
        <div className="text-muted-foreground text-sm">{message}</div>
        {action}
      </div>
    </PanelContent>
  );
}
