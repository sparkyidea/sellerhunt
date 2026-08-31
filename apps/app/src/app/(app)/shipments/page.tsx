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
import { ShipmentsTableSkeleton } from "@/modules/shipments/data/shipments-table/shipments-table-skeleton";

const ShipmentsTable = dynamic(
  () =>
    import("@/modules/shipments/data/shipments-table").then(
      (mod) => mod.ShipmentsTable
    ),
  {
    ssr: false,
    loading: () => <ShipmentsTableSkeleton />,
  }
);

export default function ShipmentsPage() {
  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Shipments</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <ShipmentsTable />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
