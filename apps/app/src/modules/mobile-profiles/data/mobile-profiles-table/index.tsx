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
import { KeyRoundIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useOpenPreview } from "@/hooks/use-open-preview";
import { useTRPC } from "@/lib/utils/trpc/client";
import { DeleteMobileProfilesDialog } from "../../components/delete-mobile-profiles-dialog";
import type { MobileProfileRow } from "../../types";
import {
  mobileProfileAppPresets,
  mobileProfileStatePresets,
} from "../mobile-profiles-presets";
import { mobileProfilesTableProperties } from "./mobile-profiles-table-properties";

/** App tab label → the `app` value page-level actions should be scoped to. */
const APP_BY_LABEL: Record<string, string> = { eBay: "ebay", Shopify: "shop" };

export function MobileProfilesTable({
  onAppChange,
}: {
  /** Reports the active app tab so the panel header can scope its actions. */
  onAppChange?: (app: string | undefined) => void;
}) {
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

  const evictMany = useMutation(
    trpc.mobileProfile.evictBearerMany.mutationOptions({
      onSuccess: async ({ count }) => {
        toast.success(
          `${count} cached ${count === 1 ? "bearer" : "bearers"} evicted; the next scan re-mints`
        );
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
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

  // PresetTabs reports the active option by label; null means the filter no
  // longer matches any tab (an operator edited the app rule by hand).
  const handleAppChange = useCallback(
    (label: string | null) => {
      onAppChange?.(label === null ? undefined : APP_BY_LABEL[label]);
    },
    [onAppChange]
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
        onActiveChange={handleAppChange}
        options={mobileProfileAppPresets}
        variant="line"
      />
      <PresetTabs
        options={mobileProfileStatePresets}
        trailing={<NotionToolbarActions enableSettings />}
      />
      <NotionToolbarChips />
      <TableView
        bulkActions={[
          {
            icon: <KeyRoundIcon />,
            isPending: evictMany.isPending,
            label: "Evict bearer",
            onClick: (rows: MobileProfileRow[]) =>
              evictMany.mutate({ ids: rows.map((row) => row.id) }),
          },
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
