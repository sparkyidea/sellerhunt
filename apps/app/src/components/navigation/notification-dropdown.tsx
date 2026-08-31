"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@sparkyidea/ui/components/dropdown-menu";
import { Icons } from "@sparkyidea/ui/icons";
import type { ReactElement } from "react";

interface Props {
  align?: "start" | "center" | "end";
  defaultOpen?: boolean;
  trigger: ReactElement;
}

const NotificationDropdown = ({
  trigger,
  defaultOpen,
  align = "end",
}: Props) => {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger render={trigger} />

      <DropdownMenuContent align={align} className="w-sm p-0">
        <div className="p-4">
          <p className="font-medium text-base text-popover-foreground">
            Notifications
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 px-4 pt-2 pb-10 text-center">
          <Icons.notification className="size-6 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            No notifications at the moment
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationDropdown;
