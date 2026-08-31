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
import { IssuesTableSkeleton } from "@/modules/issues/data/issues-table/issues-table-skeleton";

const IssuesTable = dynamic(
  () =>
    import("@/modules/issues/data/issues-table").then((mod) => mod.IssuesTable),
  {
    ssr: false,
    loading: () => <IssuesTableSkeleton />,
  }
);

export default function IssuesPage() {
  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Issues</PanelTitle>
          </PanelHeader>
        </PanelGroup>
        <PanelContent>
          <IssuesTable />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
