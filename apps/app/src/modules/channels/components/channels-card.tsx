"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { Icons } from "@sparkyidea/ui/icons";
import { useNewChannel } from "@/modules/channels/hooks/use-new-channel";
import { ChannelsTable } from "../data/channels-table";

export const ChannelsCard = () => {
  const { onOpen } = useNewChannel();

  return (
    <Card>
      <CardHeader className="flex flex-row items-end gap-4 space-y-0 px-7">
        <div className="flex-1">
          <CardTitle className="font-medium text-lg">Channels</CardTitle>
        </div>
        <Button className="h-8 gap-1" onClick={onOpen} size="sm">
          <Icons.add className="h-3.5 w-3.5" />
          Connect
        </Button>
      </CardHeader>
      <CardContent>
        <ChannelsTable />
      </CardContent>
    </Card>
  );
};
