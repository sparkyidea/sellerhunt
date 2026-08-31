"use client";

import { CreateOrganizationDialog } from "@dashseller/auth/components/auth/organization/create-organization-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@sparkyidea/ui/components/avatar";
import { Button } from "@sparkyidea/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sparkyidea/ui/components/dropdown-menu";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import { Icons } from "@sparkyidea/ui/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Plus } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useActiveChannel } from "@/hooks/use-active-channel";
import { authClient } from "@/lib/auth-client";
import { MarketplaceIcon } from "@/lib/utils/marketplace-icon";
import { useTRPC } from "@/lib/utils/trpc/client";
import { useNewChannel } from "@/modules/channels/hooks/use-new-channel";

export function ChannelSwitcherSkeleton() {
  return (
    <Button className="md:pl-0" size="lg" variant="ghost">
      <Skeleton className="hidden size-8 rounded-md md:block" />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <Skeleton className="h-4 w-21" />
      </div>
    </Button>
  );
}

export function ChannelSwitcher() {
  const trpc = useTRPC();
  const { data: groups = [], isPending } = useQuery(
    trpc.channel.getGroupedByOrganization.queryOptions()
  );
  const { data: sessionData } = authClient.useSession();
  const activeOrganizationId =
    sessionData?.session.activeOrganizationId ?? null;

  const { activeChannelId, setActiveChannel } = useActiveChannel();
  const { onOpen: onNewChannel } = useNewChannel();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  // Closing the create dialog may have added an organization; refetch the
  // grouped list so it appears in the switcher without a full reload.
  const handleCreateOrgOpenChange = useCallback(
    (open: boolean) => {
      setCreateOrgOpen(open);
      if (!open) {
        queryClient.invalidateQueries({
          queryKey: trpc.channel.getGroupedByOrganization.queryKey(),
        });
      }
    },
    [queryClient, trpc]
  );

  const activeGroup = groups.find(
    (g) => g.organization.id === activeOrganizationId
  );
  const activeGroupChannels = activeGroup?.channels ?? [];
  // A single-channel org has no "All Channels" aggregate (we hide it below
  // unless there are 2+), so that one channel is the effective selection even
  // when nothing is explicitly picked. This keeps the trigger label and the
  // menu check mark consistent with the options actually shown.
  const effectiveChannelId =
    activeChannelId ??
    (activeGroupChannels.length === 1 ? activeGroupChannels[0].id : null);
  const activeChannel = effectiveChannelId
    ? (activeGroupChannels.find((c) => c.id === effectiveChannelId) ?? null)
    : null;

  const handleSelect = useCallback(
    async (organizationId: string, channelId: string | null) => {
      // Drop pagination cursors when the data scope changes.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("cursors");
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}` as Route);

      // The active organization is resolved server-side from the session, so
      // switching it requires refetching every org-scoped query (channels,
      // listings, orders, …) and refreshing server components.
      if (organizationId !== activeOrganizationId) {
        await authClient.organization.setActive({ organizationId });
        await queryClient.invalidateQueries();
        router.refresh();
      }

      setActiveChannel(channelId);
    },
    [
      activeOrganizationId,
      searchParams,
      router,
      pathname,
      queryClient,
      setActiveChannel,
    ]
  );

  // Connecting a channel binds it to the active organization at the OAuth
  // callback, so switch into the target org first, then open the connect flow.
  const handleAddChannel = useCallback(
    async (organizationId: string) => {
      await handleSelect(organizationId, null);
      onNewChannel();
    },
    [handleSelect, onNewChannel]
  );

  // Reset the persisted active channel if it no longer belongs to the active
  // organization (org switched, archived, deleted, or a different account
  // reusing browser storage). Without this the listing/order queries would
  // silently filter by a channel ID outside the active tenant.
  useEffect(() => {
    if (
      !isPending &&
      activeChannelId &&
      !activeGroup?.channels.some((c) => c.id === activeChannelId)
    ) {
      setActiveChannel(null);
    }
  }, [isPending, activeChannelId, activeGroup, setActiveChannel]);

  if (isPending) {
    return <ChannelSwitcherSkeleton />;
  }

  // Trigger label + icon by state:
  //  - a channel is in scope        → the store name + its marketplace icon
  //  - active org has no channels    → "Add Channel" prompt + org icon
  //  - active org has 2+ channels    → org name ("All Channels" view) + org icon
  // Org icon falls back to the dashseller logo when the org has no logo.
  let triggerLabel: string;
  let triggerIcon: ReactNode;
  if (activeChannel) {
    triggerLabel = activeChannel.displayName;
    triggerIcon = (
      <MarketplaceIcon marketplaceId={activeChannel.marketplace?.id} />
    );
  } else {
    triggerLabel =
      activeGroupChannels.length === 0
        ? "Add Channel"
        : (activeGroup?.organization.name ?? "All Channels");
    triggerIcon = (
      <Avatar className="size-5.5 rounded-sm after:hidden">
        <AvatarImage
          alt=""
          className="rounded-sm"
          src={activeGroup?.organization.logo ?? undefined}
        />
        <AvatarFallback className="rounded-sm bg-transparent text-header-primary-foreground">
          <Icons.logo />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="group relative pl-0" size="lg" variant="plain" />
          }
        >
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-0 hidden h-8 w-8 -translate-y-1/2 rounded-md bg-header-primary transition-[width] duration-300 ease-out group-hover:w-full group-aria-expanded:w-full md:block"
          />
          <div className="relative z-10 hidden size-8 items-center justify-center rounded-md text-header-primary-foreground md:flex [&_svg]:size-5.5!">
            {triggerIcon}
          </div>
          <div className="relative z-10 grid min-w-0 max-w-40 flex-1 text-left text-sm leading-tight transition-colors md:group-aria-expanded:text-header-primary-foreground md:group-hover:text-header-primary-foreground">
            <span className="truncate">{triggerLabel}</span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-56 max-w-[calc(100svw-1rem)] rounded-lg"
          side="bottom"
          sideOffset={4}
        >
          {groups.map((group, index) => {
            const isActiveOrg = group.organization.id === activeOrganizationId;
            // "All Channels" is an aggregate view, so it only makes sense once
            // there are multiple channels to aggregate. With 0 or 1 channel the
            // org shows just its channel (if any) plus "Add channel".
            const showAllChannels = group.channels.length >= 2;
            return (
              <div key={group.organization.id}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">
                    {group.organization.name}
                  </DropdownMenuLabel>
                  {showAllChannels && (
                    <DropdownMenuItem
                      onClick={() => handleSelect(group.organization.id, null)}
                    >
                      <div className="flex size-6 items-center justify-center rounded-md border">
                        <Icons.logo className="size-4 shrink-0" />
                      </div>
                      All Channels
                      {isActiveOrg && effectiveChannelId === null && (
                        <CheckIcon className="ml-auto size-4" />
                      )}
                    </DropdownMenuItem>
                  )}
                  {group.channels.map((ch) => (
                    <DropdownMenuItem
                      key={ch.id}
                      onClick={() => handleSelect(group.organization.id, ch.id)}
                    >
                      <div className="flex size-6 items-center justify-center rounded-md border">
                        <MarketplaceIcon
                          className="size-4 shrink-0"
                          marketplaceId={ch.marketplace?.id}
                        />
                      </div>
                      <span className="truncate">{ch.displayName}</span>
                      {isActiveOrg && effectiveChannelId === ch.id && (
                        <CheckIcon className="ml-auto size-4" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => handleAddChannel(group.organization.id)}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                      <Plus className="size-4" />
                    </div>
                    <span className="font-medium text-muted-foreground">
                      Add channel
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </div>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOrgOpen(true)}>
            <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
              <Plus className="size-4" />
            </div>
            <span className="font-medium text-muted-foreground">
              Add organization
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog
        onOpenChange={handleCreateOrgOpenChange}
        open={createOrgOpen}
      />
    </>
  );
}
