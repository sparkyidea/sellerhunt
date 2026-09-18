"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Panel,
  PanelAction,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelTitle,
} from "@sparkyidea/ui/components/panel";
import { UploadIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { PanelRoute } from "@/components/preview/panel-route";
import { MobileProfilesTableSkeleton } from "@/modules/mobile-profiles/data/mobile-profiles-table/mobile-profiles-table-skeleton";
import { useMobileProfileDialog } from "@/modules/mobile-profiles/hooks/use-mobile-profile-dialog";

const MobileProfilesTable = dynamic(
  () =>
    import("@/modules/mobile-profiles/data/mobile-profiles-table").then(
      (mod) => mod.MobileProfilesTable
    ),
  { ssr: false, loading: () => <MobileProfilesTableSkeleton /> }
);

/**
 * The one admin list over `mobile_profile`: a persona pool seen through its
 * lifecycle status. Creating a row means capturing device credentials — the
 * bearer is derived from them by the scan worker.
 *
 * Profiles are only ever created in bulk: one pane takes every capture, each
 * entry carrying its own app and credentials. The database numbers each row;
 * a worker is attached from the profile afterwards.
 */
export default function AdminMobileProfilesPage() {
  return (
    <PanelRoute>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Mobile profiles</PanelTitle>
          </PanelHeader>
          <PanelAction>
            <Button
              onClick={() => useMobileProfileDialog.getState().onOpen()}
              size="sm"
            >
              <UploadIcon />
              Upload profiles
            </Button>
          </PanelAction>
        </PanelGroup>
        <PanelContent>
          <MobileProfilesTable />
        </PanelContent>
      </Panel>
    </PanelRoute>
  );
}
