"use client";

import { Badge } from "@sparkyidea/ui/components/badge";
import { Button } from "@sparkyidea/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sparkyidea/ui/components/dialog";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import { appLabel, profileNumber } from "../constants";
import type { MobileProfileData } from "../types";
import { EvictConsequences } from "./evict-consequences";

export function EvictBearerDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: MobileProfileData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const evict = useMutation(
    trpc.mobileProfile.evictBearer.mutationOptions({
      onSuccess: async () => {
        toast.success("Cached bearer evicted; next scan re-mints");
        await queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <KeyRoundIcon />
            Evict cached bearer
          </DialogTitle>
          <DialogDescription>
            Drops the cached bearer for this profile. Use this when the token is
            rejected upstream but the credentials are still good.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Target</span>
          <Badge variant="secondary">{appLabel(profile.app)}</Badge>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono">{profileNumber(profile.id)}</span>
        </div>

        <EvictConsequences target="this profile" />

        <DialogFooter>
          <DialogClose
            disabled={evict.isPending}
            render={<Button type="button" variant="outline" />}
          >
            Cancel
          </DialogClose>
          <Button
            disabled={evict.isPending}
            onClick={() => evict.mutate({ id: profile.id })}
            variant="destructive"
          >
            {evict.isPending && <Spinner />}
            Evict bearer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
