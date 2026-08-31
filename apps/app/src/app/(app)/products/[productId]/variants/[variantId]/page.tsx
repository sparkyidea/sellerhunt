import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { ProductVariantDetailView } from "@/modules/products/views/product-variant/product-variant-panel";
import { ProductVariantDetailViewSkeleton } from "@/modules/products/views/product-variant/product-variant-panel-skeleton";

export default async function VariantPage({
  params,
}: {
  params: Promise<{ productId: string; variantId: string }>;
}) {
  const { variantId } = await params;
  await prefetch(trpc.productVariant.getOne.queryOptions({ id: variantId }));
  await prefetch(
    trpc.productVariant.getNeighbors.queryOptions({ id: variantId })
  );

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load product variant" />}
          >
            <Suspense fallback={<ProductVariantDetailViewSkeleton />}>
              <ProductVariantDetailView id={variantId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
