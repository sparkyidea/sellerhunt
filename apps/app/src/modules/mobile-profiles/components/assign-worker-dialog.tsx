"use client";

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
import { Field, FieldLabel } from "@sparkyidea/ui/components/field";
import { Input } from "@sparkyidea/ui/components/input";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ServerIcon } from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { MobileProfileData } from "../types";
import {
  AssignedWorkerField,
  describeReassignment,
} from "./assigned-worker-field";

/**
 * The only place a profile gets a box. Upload never assigns; this dialog
 * stores the box hostname exactly as the `boxinfo` sidecar reports it, or
 * clears it. The mutation is the plain `update` — the router owns the
 * hostname check and the one-profile-per-box conflict.
 */
export function AssignWorkerDialog({
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
  const [hostname, setHostname] = useState("");
  const [hostnameError, setHostnameError] = useState<string>();
  const [loses, gains] = describeReassignment(profile.assignedWorker, hostname);

  const update = useMutation(
    trpc.mobileProfile.update.mutationOptions({
      onSuccess: async (row) => {
        toast.success(
          row.assignedWorker
            ? `Profile assigned to ${row.assignedWorker}`
            : "Profile unassigned"
        );
        await queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());
        handleOpenChange(false);
      },
      onError: (error) => {
        if (error.data?.code === "CONFLICT") {
          setHostnameError(error.message);
          return;
        }
        toast.error(error.message);
      },
    })
  );

  function handleOpenChange(next: boolean) {
    if (!next) {
      setHostname("");
      setHostnameError(undefined);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setHostnameError(undefined);
    update.mutate({ id: profile.id, assignedWorker: hostname.trim() });
  }

  const unchanged = hostname.trim() === (profile.assignedWorker ?? "");

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              <ServerIcon />
              {profile.assignedWorker ? "Reassign worker" : "Assign worker"}
            </DialogTitle>
            <DialogDescription>
              A scan box uses the profile whose assigned worker equals its
              hostname exactly. Boxes claim free profiles on their own; assign
              by hand to pin a specific one. Copy the hostname from the box.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="assign-current">Current worker</FieldLabel>
            <Input
              className="font-mono"
              disabled
              id="assign-current"
              readOnly
              value={profile.assignedWorker ?? "(unassigned)"}
            />
          </Field>

          <AssignedWorkerField
            disabled={update.isPending}
            error={hostnameError}
            id="assign-next"
            onChange={setHostname}
            value={hostname}
          />

          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground text-sm">
            <li>{loses}</li>
            <li>{gains}</li>
          </ul>

          <DialogFooter>
            {profile.assignedWorker && (
              <Button
                className="mr-auto"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({ id: profile.id, assignedWorker: null })
                }
                type="button"
                variant="ghost"
              >
                Unassign
              </Button>
            )}
            <DialogClose
              disabled={update.isPending}
              render={<Button type="button" variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button disabled={update.isPending || unchanged} type="submit">
              {update.isPending && <Spinner />}
              {profile.assignedWorker ? "Reassign" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
