"use client";

import { UserButton } from "@dashseller/auth/components/auth/user/user-button";
import { Button } from "@sparkyidea/ui/components/button";
import { Kbd } from "@sparkyidea/ui/components/kbd";
import { SidebarTrigger } from "@sparkyidea/ui/components/sidebar";
import { Icons } from "@sparkyidea/ui/icons";
import { Suspense } from "react";
import {
  ChannelSwitcher,
  ChannelSwitcherSkeleton,
} from "@/components/navigation/channel-switcher";
import { ContextualSaveBar } from "@/components/navigation/contextual-save-bar";
import { useContextSearch } from "@/hooks/use-context-search";
import { useContextualSaveBar } from "@/hooks/use-contextual-save-bar";
import NotificationDropdown from "./notification-dropdown";

export function AppHeader() {
  const { onOpen } = useContextSearch();
  const saveBarActive = useContextualSaveBar((s) => s.active !== null);

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center gap-2 bg-header-background px-2 text-header-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <SidebarTrigger className="md:hidden" />
        <Suspense fallback={<ChannelSwitcherSkeleton />}>
          <ChannelSwitcher />
        </Suspense>
      </div>

      <div className="relative h-full min-w-0 flex-2 overflow-hidden">
        <div
          aria-hidden={saveBarActive}
          className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out ${
            saveBarActive
              ? "pointer-events-none -translate-y-full"
              : "translate-y-0"
          }`}
        >
          <Button
            className="w-full max-w-160"
            onClick={onOpen}
            size="lg"
            tabIndex={saveBarActive ? -1 : 0}
            variant="secondary"
          >
            <Icons.search className="size-4" />
            <span className="flex-1 text-left">Search</span>
            <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
          </Button>
        </div>
        <div
          aria-hidden={!saveBarActive}
          className={`absolute inset-0 flex items-center transition-transform duration-300 ease-out ${
            saveBarActive
              ? "translate-y-0"
              : "pointer-events-none translate-y-full"
          }`}
        >
          <ContextualSaveBar />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <NotificationDropdown
          trigger={
            <Button
              aria-label="Notifications"
              className="text-header-foreground hover:bg-header-primary hover:text-header-primary-foreground"
              size="icon-lg"
              variant="ghost"
            >
              <Icons.notification />
            </Button>
          }
        />

        <UserButton
          align="end"
          links={[
            {
              href: "/settings/organizations",
              icon: <Icons.organization className="text-muted-foreground" />,
              label: "Organizations",
              visibility: "authenticated",
            },
          ]}
          size="icon"
        />
      </div>
    </header>
  );
}
