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
import { InventoryTableSkeleton } from "@/modules/inventory/data/inventory-table/inventory-table-skeleton";

const InventoryTable = dynamic(
  () =>
    import("@/modules/inventory/data/inventory-table").then(
      (mod) => mod.InventoryTable
    ),
  {
    ssr: false,
    loading: () => <InventoryTableSkeleton />,
  }
);

export default function InventoryPage() {
  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Inventory</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <InventoryTable />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
