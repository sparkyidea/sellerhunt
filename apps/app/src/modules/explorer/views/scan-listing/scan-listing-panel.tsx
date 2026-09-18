"use client";

import { Badge } from "@sparkyidea/ui/components/badge";
import {
  type ActionItem,
  MoreActions,
  PanelAction,
  PanelClose,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelTags,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { DynamicLink } from "@/components/layout/dynamic-link";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import {
  PreviewExpand,
  usePanelView,
} from "@/components/preview/panel-view-context";
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

function ScanListingPanelView({
  id,
  onClose,
}: {
  id: string;
  onClose?: () => void;
}) {
  const trpc = useTRPC();
  const { data: listing } = useSuspenseQuery(
    trpc.scanListing.get.queryOptions({ id })
  );
  return (
    <>
      <ScanListingHeader listing={listing} onClose={onClose} />
      <ScanListingPanelContent listing={listing} />
    </>
  );
}

export {
  ScanListingPanelView as ScanListingDetailView,
  ScanListingPanelView as ScanListingPreviewView,
};

function ScanListingHeader({
  listing,
  onClose,
}: {
  listing: ScanListingData;
  onClose?: () => void;
}) {
  const { mode } = usePanelView();
  const preview = mode === "preview";
  const actions = getScanListingActions(listing);
  return (
    <>
      {preview && onClose && (
        <PanelToolbar>
          <PanelClose onClose={onClose} />
          <PreviewExpand href={`/explorer/listings/${listing.id}`} />
          {actions.length > 0 && (
            <PanelAction>
              <MoreActions hidePinned items={actions} variant="ghost" />
            </PanelAction>
          )}
        </PanelToolbar>
      )}
      <PanelGroup>
        <PanelHeader>
          <RouteBreadcrumb currentLabel={listing.title} showRoot={!preview} />
          <ScanListingTags listing={listing} />
        </PanelHeader>
        {!preview && actions.length > 0 && (
          <PanelAction>
            <MoreActions items={actions} />
          </PanelAction>
        )}
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
