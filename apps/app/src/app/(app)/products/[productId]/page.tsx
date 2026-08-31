import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { ProductDetailView } from "@/modules/products/views/product/product-panel";
import { ProductDetailViewSkeleton } from "@/modules/products/views/product/product-panel-skeleton";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  await prefetch(trpc.product.getOne.queryOptions({ id: productId }));
  await prefetch(trpc.product.getNeighbors.queryOptions({ id: productId }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load product" />}
          >
            <Suspense fallback={<ProductDetailViewSkeleton />}>
              <ProductDetailView id={productId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
