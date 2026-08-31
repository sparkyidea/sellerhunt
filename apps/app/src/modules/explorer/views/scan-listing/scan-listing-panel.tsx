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
  PanelTags,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { DynamicLink } from "@/components/layout/dynamic-link";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { useTRPC } from "@/lib/utils/trpc/client";
import { ScanListingClassificationCard } from "../../components/scan-listing-classification-card";
import { ScanListingInfoCard } from "../../components/scan-listing-info-card";
import { ScanListingPerformanceCard } from "../../components/scan-listing-performance-card";
import { ScanListingPricingCard } from "../../components/scan-listing-pricing-card";
import { ScanListingSellerCard } from "../../components/scan-listing-seller-card";
import { ScanListingSyncCard } from "../../components/scan-listing-sync-card";
import { ScanListingVariantsCard } from "../../components/scan-listing-variants-card";
import type { ScanListingData } from "../../types";

const MARKETPLACE_LABELS: Record<string, string> = {
  ebay: "eBay",
};

function getMarketplaceLabel(listing: ScanListingData): string {
  return MARKETPLACE_LABELS[listing.marketplace] ?? listing.marketplace;
}

function getScanListingActions(listing: ScanListingData): ActionItem[] {
  if (!listing.url) {
    return [];
  }
  return [
    {
      icon: <ExternalLinkIcon />,
      label: `View on ${getMarketplaceLabel(listing)}`,
      pinned: true,
      render: <DynamicLink href={listing.url} openInNewWindow />,
    },
  ];
}

export function ScanListingDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: listing } = useSuspenseQuery(
    trpc.scanListing.get.queryOptions({ id })
  );

  return (
    <>
      <ScanListingPageHeader listing={listing} />
      <ScanListingPanelContent listing={listing} />
    </>
  );
}

export function ScanListingPreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: listing } = useSuspenseQuery(
    trpc.scanListing.get.queryOptions({ id })
  );

  return (
    <>
      <ScanListingPreviewHeader listing={listing} onClose={onClose} />
      <ScanListingPanelContent listing={listing} />
    </>
  );
}

function ScanListingPageHeader({ listing }: { listing: ScanListingData }) {
  const actions = getScanListingActions(listing);
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={listing.title} />
        <ScanListingTags listing={listing} />
      </PanelHeader>
      {actions.length > 0 && (
        <PanelAction>
          <MoreActions items={actions} />
        </PanelAction>
      )}
    </PanelGroup>
  );
}

function ScanListingPreviewHeader({
  listing,
  onClose,
}: {
  listing: ScanListingData;
  onClose: () => void;
}) {
  const actions = getScanListingActions(listing);
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand
          render={<Link href={`/explorer/listings/${listing.id}` as Route} />}
        />
        {actions.length > 0 && (
          <PanelAction>
            <MoreActions hidePinned items={actions} variant="ghost" />
          </PanelAction>
        )}
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{listing.title}</PanelTitle>
          <ScanListingTags listing={listing} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function ScanListingTags({ listing }: { listing: ScanListingData }) {
  return (
    <PanelTags>
      <Badge variant="secondary">{getMarketplaceLabel(listing)}</Badge>
      {listing.condition && (
        <Badge variant="secondary">{listing.condition}</Badge>
      )}
    </PanelTags>
  );
}

function ScanListingPanelContent({ listing }: { listing: ScanListingData }) {
  const hasVariants = listing.variants.length > 0;

  return (
    <PanelContent>
      <div className="@container">
        <div className="grid @3xl:grid-cols-7 grid-cols-1 gap-6">
          <div className="@3xl:col-span-5 flex min-w-0 flex-col gap-6">
            <ScanListingInfoCard listing={listing} />
            {hasVariants ? (
              <ScanListingVariantsCard listing={listing} />
            ) : (
              <ScanListingPricingCard listing={listing} />
            )}
          </div>
          <div className="@3xl:col-span-2 flex min-w-0 flex-col gap-6">
            <ScanListingSellerCard listing={listing} />
            <ScanListingPerformanceCard listing={listing} />
            <ScanListingClassificationCard listing={listing} />
            <ScanListingSyncCard listing={listing} />
          </div>
        </div>
      </div>
    </PanelContent>
  );
}
