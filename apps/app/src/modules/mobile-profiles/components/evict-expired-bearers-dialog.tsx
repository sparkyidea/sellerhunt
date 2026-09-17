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
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import { appLabel } from "../constants";
import { EvictConsequences } from "./evict-consequences";

/**
 * Fleet-wide evict of every bearer the database clock calls expired, scoped to
 * the app tab the operator is looking at (all apps when no app tab is active).
 */
export function EvictExpiredBearersDialog({
  app,
  open,
  onOpenChange,
}: {
  app?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const evict = useMutation(
    trpc.mobileProfile.evictExpiredBearers.mutationOptions({
      onSuccess: async ({ count }) => {
        toast.success(
          count === 0
            ? "No expired bearers to evict"
            : `${count} expired ${count === 1 ? "bearer" : "bearers"} evicted`
        );
        await queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const scope = app === undefined ? "every app" : appLabel(app);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Evict expired bearers</DialogTitle>
          <DialogDescription>
            Drops every cached bearer that has already expired. Profiles with a
            valid or expiring bearer are left alone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Scope</span>
          <Badge variant="secondary">{scope}</Badge>
        </div>

        <EvictConsequences target="every expired profile in scope" />

        <DialogFooter>
          <DialogClose
            disabled={evict.isPending}
            render={<Button type="button" variant="outline" />}
          >
            Cancel
          </DialogClose>
          <Button
            disabled={evict.isPending}
            onClick={() => evict.mutate({ app })}
            variant="destructive"
          >
            {evict.isPending && <Spinner />}
            Evict expired
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
