"use client";

import { usePageController } from "@sparkyidea/dataview/hooks";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import { NotionToolbar } from "@sparkyidea/dataview/toolbars/notion";
import type { Limit, WhereNode } from "@sparkyidea/dataview/types";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { DataViewTab } from "@/components/dataview-tab";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import { issuesPresets } from "../issues-presets";
import type { Issue } from "./issues-table-properties";
import { issuesTableProperties } from "./issues-table-properties";

interface IssuesTableProps {
  filter?: WhereNode[] | null;
  limit?: Limit;
  search?: string;
  sort?: { property: string; direction: "asc" | "desc" }[];
}

export function IssuesTable({
  filter = null,
  limit = 25,
  search = "",
  sort = [{ property: "openedAt", direction: "desc" }],
}: IssuesTableProps) {
  const trpc = useTRPC();
  const openPreview = useOpenPreview();

  const { controller } = usePageController({
    groupQuery: (params) =>
      trpc.issue.getGroup.infiniteQueryOptions(params, {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }),

    dataQuery: (params) => trpc.issue.getMany.queryOptions(params),
  });

  return (
    <DataViewProvider
      controller={controller}
      defaults={{
        filter,
        limit,
        search,
        sort,
      }}
      properties={issuesTableProperties}
    >
      <NotionToolbar enableSettings>
        <DataViewTab options={issuesPresets} />
      </NotionToolbar>
      <TableView
        onRowClick={(row: Issue) => openPreview.issue(row.id)}
        pagination="page"
        showVerticalLines={false}
      />
    </DataViewProvider>
  );
}
