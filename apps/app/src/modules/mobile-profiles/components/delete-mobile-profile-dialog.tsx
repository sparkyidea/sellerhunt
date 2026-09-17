"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@sparkyidea/ui/components/alert-dialog";
import { Button } from "@sparkyidea/ui/components/button";
import { Field, FieldLabel } from "@sparkyidea/ui/components/field";
import { Input } from "@sparkyidea/ui/components/input";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import { appLabel, profileNumber } from "../constants";
import type { MobileProfileData } from "../types";

export function DeleteMobileProfileDialog({
  profile,
  open,
  onOpenChange,
  onDeleted,
}: {
  profile: MobileProfileData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const previewId = `delete-profile-${profile.id}`;

  const remove = useMutation(
    trpc.mobileProfile.delete.mutationOptions({
      onSuccess: async () => {
        toast.success(`Deleted ${profileNumber(profile.id)}`);
        onOpenChange(false);
        onDeleted();
        queryClient.removeQueries(
          trpc.mobileProfile.get.queryFilter({ id: profile.id })
        );
        await queryClient.invalidateQueries(
          trpc.mobileProfile.getMany.pathFilter()
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete mobile profile</AlertDialogTitle>
          <AlertDialogDescription>
            Removes the persona and its encrypted credentials permanently.
            {profile.assignedWorker
              ? ` Box ${profile.assignedWorker} claims a free profile on its next run, or fails to load one if none is free.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Field>
          <FieldLabel htmlFor={previewId}>Profile</FieldLabel>
          <Input
            className="font-mono text-xs"
            disabled
            id={previewId}
            readOnly
            value={`${appLabel(profile.app)} · ${profileNumber(profile.id)}`}
          />
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            disabled={remove.isPending}
            onClick={() => remove.mutate({ id: profile.id })}
            type="button"
            variant="destructive"
          >
            {remove.isPending && <Spinner />}
            Delete profile
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
