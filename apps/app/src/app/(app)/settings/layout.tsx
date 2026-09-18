"use client";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@sparkyidea/ui/components/sheet";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SettingsSidebar } from "@/components/navigation/settings-nav";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function Settings({ children }: SettingsLayoutProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const returnTo = useRef("/explorer/listings");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings tabs share this layout but do not retain the `from` query string.
  useEffect(() => {
    setIsOpen(true);
    returnTo.current =
      new URLSearchParams(window.location.search).get("from") ||
      "/explorer/listings";
    return () => {
      if (closeTimer.current !== null) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
    }
    closeTimer.current = setTimeout(() => {
      router.push(returnTo.current as Route);
    }, 200);
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
