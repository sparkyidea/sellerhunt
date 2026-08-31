"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@sparkyidea/ui/components/drawer";
import { cn } from "@sparkyidea/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import React, { useState } from "react";

interface MobileToolbarGroupProps {
  children: React.ReactNode;
  className?: string;
  label: string;
  trigger?: React.ReactNode;
}

function MobileToolbarGroup({
  label,
  children,
  className,
  trigger,
}: MobileToolbarGroupProps) {
  const [isOpen, setIsOpen] = useState(false);

  const closeDrawer = () => setIsOpen(false);

  return (
    <Drawer onOpenChange={setIsOpen} open={isOpen}>
      <DrawerTrigger asChild>
        <Button
          className={cn("h-8 w-max gap-1 px-3 font-normal", className)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {trigger ?? (
            <>
              {label}
              <ChevronDown className="size-4" />
            </>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-start">{label}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col p-4">
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child, { closeDrawer } as {
                  closeDrawer: () => void;
                })
              : child
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

type MobileToolbarItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  closeDrawer?: () => void;
};

function MobileToolbarItem({
  children,
  active,
  onClick,
  closeDrawer,
  ...props
}: MobileToolbarItemProps) {
  return (
    <button
      className={cn(
        "flex w-full items-center rounded-md px-4 py-2 text-sm transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
      onClick={(e) => {
        onClick?.(e);
        setTimeout(() => {
          closeDrawer?.();
        }, 100);
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export { MobileToolbarGroup, MobileToolbarItem };
