import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { ScanListingDetailView } from "@/modules/explorer/views/scan-listing/scan-listing-panel";
import { ScanListingDetailViewSkeleton } from "@/modules/explorer/views/scan-listing/scan-listing-panel-skeleton";

export default async function ScanListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  await prefetch(trpc.scanListing.get.queryOptions({ id: listingId }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load listing" />}
          >
            <Suspense fallback={<ScanListingDetailViewSkeleton />}>
              <ScanListingDetailView id={listingId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
