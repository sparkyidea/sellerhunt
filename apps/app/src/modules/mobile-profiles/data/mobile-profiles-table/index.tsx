"use client";

import { usePageController } from "@sparkyidea/dataview/hooks";
import { PresetTabs } from "@sparkyidea/dataview/preset-tabs";
import { DataViewProvider } from "@sparkyidea/dataview/providers";
import {
  NotionToolbarActions,
  NotionToolbarChips,
} from "@sparkyidea/dataview/toolbars/notion";
import { TableView } from "@sparkyidea/dataview/views/table-view";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import { DeleteMobileProfilesDialog } from "../../components/delete-mobile-profiles-dialog";
import type { MobileProfileRow } from "../../types";
import {
  mobileProfileAppPresets,
  mobileProfileStatusPresets,
} from "../mobile-profiles-presets";
import { mobileProfilesTableProperties } from "./mobile-profiles-table-properties";

export function MobileProfilesTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openPreview = useOpenPreview();
  // Deleting is the one bulk action with no undo, so it goes through a
  // confirmation that names the boxes losing their persona.
  const [pendingDelete, setPendingDelete] = useState<MobileProfileRow[]>([]);

  const { controller } = usePageController({
    dataQuery: (params) => trpc.mobileProfile.getMany.queryOptions(params),
  });

  const refresh = () =>
    queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());

  const resetMany = useMutation(
    trpc.mobileProfile.resetFailuresMany.mutationOptions({
      onSuccess: async ({ count }) => {
        toast.success(
          `Failure counters reset on ${count} ${count === 1 ? "profile" : "profiles"}`
        );
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <DataViewProvider
      controller={controller}
      defaults={{
        filter: null,
        limit: 25,
        search: "",
        sort: [{ property: "accessTokenExpiresAt", direction: "asc" }],
      }}
      properties={mobileProfilesTableProperties}
    >
      <PresetTabs
        aria-label="App"
        mobileSelect={false}
        options={mobileProfileAppPresets}
        variant="line"
      />
      <PresetTabs
        options={mobileProfileStatusPresets}
        trailing={<NotionToolbarActions enableSettings />}
      />
      <NotionToolbarChips />
      <TableView
        bulkActions={[
          {
            icon: <RotateCcwIcon />,
            isPending: resetMany.isPending,
            label: "Reset failures",
            onClick: (rows: MobileProfileRow[]) =>
              resetMany.mutate({ ids: rows.map((row) => row.id) }),
          },
          {
            icon: <Trash2Icon />,
            label: "Delete…",
            onClick: (rows: MobileProfileRow[]) => setPendingDelete(rows),
            variant: "destructive",
          },
        ]}
        onRowClick={(row: MobileProfileRow) =>
          openPreview("mobile-profile", String(row.id))
        }
        pagination="page"
        showVerticalLines={false}
        stickyHeader={{ enabled: true, offset: 0 }}
      />
      <DeleteMobileProfilesDialog
        onDeleted={() => setPendingDelete([])}
        onOpenChange={(next) => {
          if (!next) {
            setPendingDelete([]);
          }
        }}
        open={pendingDelete.length > 0}
        profiles={pendingDelete}
      />
    </DataViewProvider>
  );
}
