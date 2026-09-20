"use client";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@sparkyidea/ui/components/sheet";
import { useEffect, useRef, useState } from "react";
import { useSettingsNavigation } from "@/components/navigation/navigation-area";
import { SettingsSidebar } from "@/components/navigation/settings-nav";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function Settings({ children }: SettingsLayoutProps) {
  const { closeSettings } = useSettingsNavigation();
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
    closeTimer.current = setTimeout(closeSettings, 200);
  };

  return (
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
  );
}
