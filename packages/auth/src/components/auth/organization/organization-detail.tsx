"use client";

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth } from "@better-auth-ui/react";
import {
  useActiveOrganization,
  useSetActiveOrganization,
} from "@better-auth-ui/react/plugins/organization";
import { organizationPlugin } from "@dashseller/auth/lib/auth/organization-plugin";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useEffect } from "react";
import { OrganizationDangerZone } from "./organization-danger-zone";
import { OrganizationPeople } from "./organization-people";
import { OrganizationProfile } from "./organization-profile";

export interface OrganizationDetailProps {
  organizationId: string;
}

/**
 * Single-organization management view, identified by the `organizationId` URL
 * segment. Promotes that organization to the active one (the settings/people
 * components render the active organization), then shows its settings and people
 * stacked on a single page. An unknown id falls back to the organizations list.
 */
export function OrganizationDetail({
  organizationId,
}: OrganizationDetailProps) {
  const { authClient, basePaths, navigate, plugins } = useAuth();

  const { settings: settingsPaths } = organizationPlugin().viewPaths;
  const organizationsListHref = `${basePaths.settings}/${settingsPaths.organizations}`;

  const { data: activeOrganization, isPending } = useActiveOrganization(
    authClient as OrganizationAuthClient
  );

  const { mutate: setActiveOrganization, isPending: setActivePending } =
    useSetActiveOrganization(authClient as OrganizationAuthClient, {
      onError: () => navigate({ to: organizationsListHref }),
    });

  const isActive = activeOrganization?.id === organizationId;

  useEffect(() => {
    if (!(isPending || isActive || setActivePending)) {
      setActiveOrganization({ organizationId });
    }
  }, [
    isPending,
    isActive,
    setActivePending,
    organizationId,
    setActiveOrganization,
  ]);

  if (!isActive) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h1 className="font-semibold text-2xl">{activeOrganization.name}</h1>

      <div className="flex flex-col gap-4 md:gap-6">
        <OrganizationProfile />

        <OrganizationPeople />

        {plugins.flatMap((plugin) =>
          plugin.organizationCards?.map((Card, index) => (
            <Card key={`${plugin.id}-${index.toString()}`} />
          ))
        )}

        <OrganizationDangerZone />
      </div>
    </div>
  );
}
