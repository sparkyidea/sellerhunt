"use client";

import { MobileProfileDialog } from "@/modules/mobile-profiles/components/mobile-profile-dialog";

/** Admin dialogs mount only inside the role-gated admin route. */
export function WidgetProvider() {
  return <MobileProfileDialog />;
}
