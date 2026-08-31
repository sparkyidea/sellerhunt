"use client";
import {
  Panel,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelProvider,
  PanelTitle,
} from "@sparkyidea/ui/components/panel";
import dynamic from "next/dynamic";
import { OrdersTableSkeleton } from "@/modules/orders/data/orders-table/orders-table-skeleton";

const OrdersTable = dynamic(
  () =>
    import("@/modules/orders/data/orders-table").then((mod) => mod.OrdersTable),
  {
    ssr: false,
    loading: () => <OrdersTableSkeleton />,
  }
);

export default function OrdersPage() {
  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Orders</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <OrdersTable />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
