"use client";

import {
  type ActionItem,
  MoreActions,
  PanelAction,
  PanelClose,
  PanelContent,
  PanelGroup,
  PanelHeader,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { usePanel } from "@sparkyidea/ui/components/panel-root";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { PreviewExpandLink } from "@/components/panels/preview-expand-link";
import { useTRPC } from "@/lib/utils/trpc/client";
import { MobileProfileBearerCard } from "../../components/mobile-profile-bearer-card";
import { MobileProfileHealthCard } from "../../components/mobile-profile-health-card";
import { MobileProfileIdentifiersCard } from "../../components/mobile-profile-identifiers-card";
import { MobileProfileInfoCard } from "../../components/mobile-profile-info-card";
import { MobileProfileTags } from "../../components/mobile-profile-tags";
import { useMobileProfileActions } from "../../components/use-mobile-profile-actions";
import { parseProfileId, profileNumber } from "../../constants";
import type { MobileProfileData } from "../../types";

function profileTitle(profile: MobileProfileData): string {
  return profileNumber(profile.id);
}

function MobileProfilePanelView({
  id,
  onClose,
}: {
  id: number | string;
  onClose?: () => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const { mode } = usePanel();
  const { data: profile } = useSuspenseQuery(
    trpc.mobileProfile.get.queryOptions({
      id: typeof id === "string" ? parseProfileId(id) : id,
    })
  );
  const { actions, dialogs } = useMobileProfileActions(profile, {
    onDeleted: () => {
      if (mode === "main") {
        router.push("/admin/mobile-profiles");
      } else {
        onClose?.();
      }
    },
  });
  return (
    <>
      <MobileProfileHeader
        actions={actions}
        onClose={onClose}
        profile={profile}
      />
      <MobileProfilePanelContent profile={profile} />
      {dialogs}
    </>
  );
}

export function MobileProfileDetailView({ id }: { id: number }) {
  return <MobileProfilePanelView id={id} />;
}

export function MobileProfilePreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  return <MobileProfilePanelView id={id} onClose={onClose} />;
}

function MobileProfileHeader({
  profile,
  actions,
  onClose,
}: {
  profile: MobileProfileData;
  actions: ActionItem[];
  onClose?: () => void;
}) {
  const { mode } = usePanel();
  const preview = mode === "preview";
  return (
    <>
      {preview && onClose && (
        <PanelToolbar>
          <PanelClose onClose={onClose} />
          <PreviewExpandLink href={`/admin/mobile-profiles/${profile.id}`} />
          {actions.length > 0 && (
            <PanelAction>
              <MoreActions hidePinned items={actions} variant="ghost" />
            </PanelAction>
          )}
        </PanelToolbar>
      )}
      <PanelGroup>
        <PanelHeader>
          <RouteBreadcrumb
            currentLabel={profileTitle(profile)}
            showRoot={!preview}
          />
          <MobileProfileTags profile={profile} />
        </PanelHeader>
        {!preview && actions.length > 0 && (
          <PanelAction>
            <MoreActions items={actions} />
          </PanelAction>
        )}
      </PanelGroup>
    </>
  );
}

function MobileProfilePanelContent({
  profile,
}: {
  profile: MobileProfileData;
}) {
  return (
    <PanelContent>
      <div className="@container">
        <div className="grid @3xl:grid-cols-7 grid-cols-1 gap-6">
          <div className="@3xl:col-span-4 flex min-w-0 flex-col gap-6">
            <MobileProfileInfoCard profile={profile} />
            <MobileProfileIdentifiersCard profile={profile} />
          </div>
          <div className="@3xl:col-span-3 flex min-w-0 flex-col gap-6">
            <MobileProfileHealthCard profile={profile} />
            <MobileProfileBearerCard profile={profile} />
          </div>
        </div>
      </div>
    </PanelContent>
  );
}
