"use client";

import { UserButton } from "@dashseller/auth/components/auth/user/user-button";
import { Button } from "@sparkyidea/ui/components/button";
import { SidebarTrigger } from "@sparkyidea/ui/components/sidebar";
import { Icons } from "@sparkyidea/ui/icons";
import { ContextualSaveBar } from "@/components/navigation/contextual-save-bar";
import NotificationDropdown from "./notification-dropdown";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center gap-2 bg-header-background px-2 text-header-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <SidebarTrigger className="md:hidden" />
      </div>

      <div className="flex h-full min-w-0 flex-2 items-center justify-center overflow-hidden">
        <ContextualSaveBar />
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

        <UserButton align="end" size="icon" />
      </div>
    </header>
  );
}
