import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { ListingDetailView } from "@/modules/listings/views/listing/listing-panel";
import { ListingDetailViewSkeleton } from "@/modules/listings/views/listing/listing-panel-skeleton";

export default async function ListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  await prefetch(trpc.listing.getOne.queryOptions({ id: listingId }));
  await prefetch(trpc.listing.getNeighbors.queryOptions({ id: listingId }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load listing" />}
          >
            <Suspense fallback={<ListingDetailViewSkeleton />}>
              <ListingDetailView id={listingId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
