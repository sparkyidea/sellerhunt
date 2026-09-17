"use client";

import type { ActionItem } from "@sparkyidea/ui/components/panel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { MobileProfileData } from "../types";
import { DeleteMobileProfileDialog } from "./delete-mobile-profile-dialog";

/**
 * Owns the ops mutations and dialogs for one profile so both panel wrappers
 * (route detail, side preview) share them while their headers stay
 * presentational. Returns the `MoreActions` items and the dialogs to mount.
 * A persona's credentials and box never change from here: a capture that
 * must change is deleted and uploaded again.
 */
export function useMobileProfileActions(
  profile: MobileProfileData,
  { onDeleted }: { onDeleted: () => void }
): {
  actions: ActionItem[];
  dialogs: ReactNode;
} {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());

  const resetFailures = useMutation(
    trpc.mobileProfile.resetFailures.mutationOptions({
      onSuccess: async () => {
        toast.success("Failure counters reset");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const nothingToReset =
    profile.failureCount === 0 &&
    profile.cooldownUntil === null &&
    profile.failureReason === null &&
    profile.failedAt === null;

  const actions: ActionItem[] = [
    {
      icon: <RotateCcwIcon />,
      label: "Reset failures",
      pinned: true,
      disabled: nothingToReset || resetFailures.isPending,
      onSelect: () => resetFailures.mutate({ id: profile.id }),
    },
    {
      icon: <Trash2Icon />,
      label: "Delete…",
      onSelect: () => setDeleteOpen(true),
    },
  ];

  const dialogs = (
    <DeleteMobileProfileDialog
      onDeleted={onDeleted}
      onOpenChange={setDeleteOpen}
      open={deleteOpen}
      profile={profile}
    />
  );

  return { actions, dialogs };
}
