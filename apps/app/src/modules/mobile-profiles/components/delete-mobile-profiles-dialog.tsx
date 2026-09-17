"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@sparkyidea/ui/components/alert-dialog";
import { Button } from "@sparkyidea/ui/components/button";
import { Field, FieldDescription } from "@sparkyidea/ui/components/field";
import { Input } from "@sparkyidea/ui/components/input";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { MobileProfileRow } from "../types";

/**
 * Bulk delete off the table selection. Deleting a persona is the one profile
 * action with no undo and no fence, so the button is armed by typing
 * `delete <count>`: the count has to match what is selected, which a stale
 * selection cannot satisfy from muscle memory.
 */
export function DeleteMobileProfilesDialog({
  onDeleted,
  onOpenChange,
  open,
  profiles,
}: {
  onDeleted: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  profiles: MobileProfileRow[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const confirmId = useId();
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    []
  );

  const count = profiles.length;
  const phrase = `delete ${count}`;
  const armed = typed.trim().toLowerCase() === phrase;
  const assigned = profiles.filter(
    (profile) => profile.assignedWorker !== null
  ).length;

  const remove = useMutation(
    trpc.mobileProfile.deleteMany.mutationOptions({
      onSuccess: async ({ count: deleted }) => {
        toast.success(
          `Deleted ${deleted} ${deleted === 1 ? "profile" : "profiles"}`
        );
        onOpenChange(false);
        onDeleted();
        for (const profile of profiles) {
          queryClient.removeQueries(
            trpc.mobileProfile.get.queryFilter({ id: profile.id })
          );
        }
        await queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());
      },
      onError: (error) => toast.error(error.message),
    })
  );

  function handleOpenChange(next: boolean) {
    setTyped("");
    onOpenChange(next);
  }

  function copyPhrase() {
    navigator.clipboard
      .writeText(phrase)
      .then(() => {
        setCopied(true);
        if (copiedTimer.current) {
          clearTimeout(copiedTimer.current);
        }
        copiedTimer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Could not copy to the clipboard"));
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} {count === 1 ? "mobile profile" : "mobile profiles"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Removes each persona and its encrypted credentials permanently.
            {assigned > 0
              ? ` ${assigned} of ${assigned === 1 ? "them is" : "them are"} the profile a box selects by label.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Field>
          {/*
            Not a <label>: a click anywhere in a label is forwarded to its
            control, which would focus the field and drop the selection the
            chip's `select-all` just made. The field carries the same sentence
            as its accessible name instead.
          */}
          <div className="flex items-center gap-2 font-medium text-sm">
            Type
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted py-0.5 pr-0.5 pl-1.5">
              <code className="select-all font-mono text-foreground text-xs">
                {phrase}
              </code>
              <Button
                aria-label={`Copy "${phrase}"`}
                className="text-muted-foreground"
                onClick={copyPhrase}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </span>
            to confirm
          </div>
          <Input
            aria-label={`Type ${phrase} to confirm`}
            autoComplete="off"
            className="font-mono"
            disabled={remove.isPending}
            id={confirmId}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={phrase}
            spellCheck={false}
            value={typed}
          />
          <FieldDescription>
            The count has to match the selection, so a stale selection cannot be
            confirmed by habit.
          </FieldDescription>
        </Field>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            disabled={!armed || remove.isPending || count === 0}
            onClick={() =>
              remove.mutate({ ids: profiles.map((profile) => profile.id) })
            }
            type="button"
            variant="destructive"
          >
            {remove.isPending && <Spinner />}
            Delete {count === 1 ? "profile" : "profiles"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
