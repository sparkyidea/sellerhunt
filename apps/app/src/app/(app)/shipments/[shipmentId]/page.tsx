import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorView } from "@/components/error-view";
import { HydrateClient, prefetch, trpc } from "@/lib/utils/trpc/server";
import { ShipmentMapPanel } from "@/modules/shipments/views/shipment/shipment-map-panel";
import { ShipmentDetailView } from "@/modules/shipments/views/shipment/shipment-panel";
import { ShipmentDetailViewSkeleton } from "@/modules/shipments/views/shipment/shipment-panel-skeleton";

export default async function ShipmentPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  await prefetch(trpc.shipment.getOne.queryOptions({ id: shipmentId }));
  await prefetch(trpc.shipment.getNeighbors.queryOptions({ id: shipmentId }));

  return (
    <HydrateClient>
      <PanelProvider>
        <Panel>
          <ErrorBoundary
            fallback={<ErrorView message="Failed to load shipment" />}
          >
            <Suspense fallback={<ShipmentDetailViewSkeleton />}>
              <ShipmentDetailView id={shipmentId} />
            </Suspense>
          </ErrorBoundary>
        </Panel>
      </PanelProvider>
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <ShipmentMapPanel id={shipmentId} />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
}
