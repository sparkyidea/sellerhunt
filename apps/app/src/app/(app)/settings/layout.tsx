"use client";

import { Panel } from "@sparkyidea/ui/components/panel";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@sparkyidea/ui/components/sheet";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SettingsSidebar } from "@/components/navigation/settings-nav";
import { PanelRoute } from "@/components/panels/panel-route";
import { useSettingsOrigin } from "@/hooks/use-settings-origin";
import { SETTINGS_HOME } from "@/lib/navigation-area";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function Settings({ children }: SettingsLayoutProps) {
  const router = useRouter();
  const returnTo = useSettingsOrigin((s) => s.returnTo);
  const [isOpen, setIsOpen] = useState(true);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsOpen(true);
    return () => {
      if (closeTimer.current !== null) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  // Let the sheet animate out, then return to where settings was opened from.
  const handleClose = () => {
    setIsOpen(false);
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
    }
    closeTimer.current = setTimeout(() => {
      router.push((returnTo ?? SETTINGS_HOME) as Route);
    }, 200);
  };

  return (
    <>
      {/* Settings is an ordinary route: it publishes an empty panel, so the
          page it was opened from unmounts instead of living on under a URL
          without its query. Closing returns to the origin URL and the page
          remounts from the query cache. The panel also keeps the content area
          white behind the sheet while it animates. */}
      <PanelRoute>
        <Panel className="max-w-none" />
      </PanelRoute>
      <Sheet onOpenChange={handleClose} open={isOpen}>
        <SheetContent
          className="flex flex-row gap-2 overflow-hidden rounded-t-xl data-[side=bottom]:h-[calc(100vh-3.5rem)]"
          side="bottom"
        >
          <SheetTitle className="sr-only">Settings</SheetTitle>
          <div className="h-full p-4 pr-0">
            <SettingsSidebar />
          </div>
          <div className="h-full w-full overflow-y-auto p-4 pt-6 pr-6">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
