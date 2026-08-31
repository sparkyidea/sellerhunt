"use client";

import { useIsMounted } from "usehooks-ts";
import { ContextSearchCommand } from "@/components/navigation/context-search-command";
import { NewChannelDialog } from "@/modules/channels/components/new-channel-dialog";

export const WidgetProvider = () => {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <NewChannelDialog />
      <ContextSearchCommand />
    </>
  );
};
