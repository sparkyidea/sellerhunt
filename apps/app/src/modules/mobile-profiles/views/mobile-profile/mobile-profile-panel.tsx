"use client";

import {
  type ActionItem,
  MoreActions,
  PanelAction,
  PanelClose,
  PanelContent,
  PanelExpand,
  PanelGroup,
  PanelHeader,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
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

export function MobileProfileDetailView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const { data: profile } = useSuspenseQuery(
    trpc.mobileProfile.get.queryOptions({ id })
  );
  const { actions, dialogs } = useMobileProfileActions(profile, {
    onDeleted: () => router.push("/admin/mobile-profiles"),
  });

  return (
    <>
      <MobileProfilePageHeader actions={actions} profile={profile} />
      <MobileProfilePanelContent profile={profile} />
      {dialogs}
    </>
  );
}

export function MobileProfilePreviewView({
  id,
  onClose,
}: {
  /** String because the preview registry is generic over kinds. */
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: profile } = useSuspenseQuery(
    trpc.mobileProfile.get.queryOptions({ id: parseProfileId(id) })
  );
  const { actions, dialogs } = useMobileProfileActions(profile, {
    onDeleted: onClose,
  });

  return (
    <>
      <MobileProfilePreviewHeader
        actions={actions}
        onClose={onClose}
        profile={profile}
      />
      <MobileProfilePanelContent profile={profile} />
      {dialogs}
    </>
  );
}

function MobileProfilePageHeader({
  profile,
  actions,
}: {
  profile: MobileProfileData;
  actions: ActionItem[];
}) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={profileTitle(profile)} />
        <MobileProfileTags profile={profile} />
      </PanelHeader>
      {actions.length > 0 && (
        <PanelAction>
          <MoreActions items={actions} />
        </PanelAction>
      )}
    </PanelGroup>
  );
}

function MobileProfilePreviewHeader({
  profile,
  actions,
  onClose,
}: {
  profile: MobileProfileData;
  actions: ActionItem[];
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand
          render={
            <Link href={`/admin/mobile-profiles/${profile.id}` as Route} />
          }
        />
        {actions.length > 0 && (
          <PanelAction>
            <MoreActions hidePinned items={actions} variant="ghost" />
          </PanelAction>
        )}
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{profileTitle(profile)}</PanelTitle>
          <MobileProfileTags profile={profile} />
        </PanelHeader>
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
