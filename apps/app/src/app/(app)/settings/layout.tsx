"use client";

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
