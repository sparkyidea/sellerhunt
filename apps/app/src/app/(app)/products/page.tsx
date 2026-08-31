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
import { ProductsTableSkeleton } from "@/modules/products/data/products-table/products-table-skeleton";

const ProductsTable = dynamic(
  () =>
    import("@/modules/products/data/products-table").then(
      (mod) => mod.ProductsTable
    ),
  {
    ssr: false,
    loading: () => <ProductsTableSkeleton />,
  }
);

export default function ProductsPage() {
  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Products</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <ProductsTable />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
