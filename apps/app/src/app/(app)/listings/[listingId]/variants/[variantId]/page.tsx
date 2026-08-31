import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { ListingVariantDetailView } from "@/modules/listings/views/listing-variant/listing-variant-panel";
import { ListingVariantDetailViewSkeleton } from "@/modules/listings/views/listing-variant/listing-variant-panel-skeleton";

export default async function ListingVariantPage({
  params,
}: {
  params: Promise<{ listingId: string; variantId: string }>;
}) {
  const { variantId } = await params;
  await prefetch(trpc.listingVariant.getOne.queryOptions({ id: variantId }));
  await prefetch(
    trpc.listingVariant.getNeighbors.queryOptions({ id: variantId })
  );

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load listing variant" />}
          >
            <Suspense fallback={<ListingVariantDetailViewSkeleton />}>
              <ListingVariantDetailView id={variantId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
