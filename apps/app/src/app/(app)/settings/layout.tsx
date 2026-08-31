"use client";

import { Panel, PanelProvider } from "@sparkyidea/ui/components/panel";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@sparkyidea/ui/components/sheet";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SettingsSidebar } from "@/components/navigation/settings-nav";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function Settings({ children }: SettingsLayoutProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    const history = new URLSearchParams(window.location.search).get("from");
    setTimeout(() => {
      router.push((history || "/products") as Route);
    }, 200);
  };

  return (
    <>
      {/* Surface panel behind the sheet: the Sheet portals to <body>, so this
          route renders nothing in the app content area on its own. Without a
          panel here the area falls back to the dark app shell
          (bg-header-background), which flashes through during the sheet's
          open/close animation. An empty Panel gives it the same white surface
          every other page uses. */}
      <PanelProvider>
        <Panel className="max-w-none" />
      </PanelProvider>
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
