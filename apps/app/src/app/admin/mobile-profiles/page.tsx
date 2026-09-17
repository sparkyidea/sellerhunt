"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Panel,
  PanelAction,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelProvider,
  PanelTitle,
} from "@sparkyidea/ui/components/panel";
import { Trash2Icon, UploadIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { EvictExpiredBearersDialog } from "@/modules/mobile-profiles/components/evict-expired-bearers-dialog";
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
 * token cache. Creating a row still means capturing device credentials — the
 * bearer is derived from them by the scan worker.
 *
 * `Evict expired` sits with `Upload profiles` in the panel header because both
 * act on the pool rather than on the current selection; the table reports its
 * active app tab so the evict stays scoped to what the operator is looking at.
 *
 * Profiles are only ever created in bulk: one pane takes every capture, each
 * entry carrying its own app and credentials. The database numbers each row;
 * a worker is attached from the profile afterwards.
 */
export default function AdminMobileProfilesPage() {
  const [evictExpiredOpen, setEvictExpiredOpen] = useState(false);
  const [activeApp, setActiveApp] = useState<string | undefined>(undefined);

  return (
    <PanelProvider>
      <Panel className="max-w-none">
        <PanelGroup>
          <PanelHeader>
            <PanelTitle>Mobile profiles</PanelTitle>
          </PanelHeader>
          <PanelAction>
            <Button
              onClick={() => setEvictExpiredOpen(true)}
              size="sm"
              variant="outline"
            >
              <Trash2Icon />
              Evict expired
            </Button>
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
          <MobileProfilesTable onAppChange={setActiveApp} />
        </PanelContent>
      </Panel>
      <EvictExpiredBearersDialog
        app={activeApp}
        onOpenChange={setEvictExpiredOpen}
        open={evictExpiredOpen}
      />
    </PanelProvider>
  );
}
