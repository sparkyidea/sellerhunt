import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { OrderDetailView } from "@/modules/orders/views/order/order-panel";
import { OrderDetailViewSkeleton } from "@/modules/orders/views/order/order-panel-skeleton";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  await prefetch(trpc.order.getOne.queryOptions({ id: orderId }));
  await prefetch(trpc.order.getNeighbors.queryOptions({ id: orderId }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load order" />}
          >
            <Suspense fallback={<OrderDetailViewSkeleton />}>
              <OrderDetailView id={orderId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
    </HydrateClient>
  );
}
