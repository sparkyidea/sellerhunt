"use client";

import type { ActionItem } from "@sparkyidea/ui/components/panel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LockKeyholeIcon,
  RotateCcwIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import { useReplaceCredentialsDialog } from "../hooks/use-replace-credentials-dialog";
import type { MobileProfileData } from "../types";
import { AssignWorkerDialog } from "./assign-worker-dialog";
import { DeleteMobileProfileDialog } from "./delete-mobile-profile-dialog";

/**
 * Owns the ops mutations and dialogs for one profile so both panel wrappers
 * (route detail, side preview) share them while their headers stay
 * presentational. Returns the `MoreActions` items, the dialogs to mount, and
 * openers for the card-level buttons.
 */
export function useMobileProfileActions(
  profile: MobileProfileData,
  { onDeleted }: { onDeleted: () => void }
): {
  actions: ActionItem[];
  dialogs: ReactNode;
  openAssign: () => void;
  openReplace: () => void;
} {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const openReplace = () =>
    useReplaceCredentialsDialog.getState().onOpen(profile.id);

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
      icon: <ServerIcon />,
      label: profile.assignedWorker ? "Reassign worker…" : "Assign worker…",
      onSelect: () => setAssignOpen(true),
    },
    {
      icon: <LockKeyholeIcon />,
      label: "Replace credentials…",
      onSelect: () => openReplace(),
    },
    {
      icon: <Trash2Icon />,
      label: "Delete…",
      onSelect: () => setDeleteOpen(true),
    },
  ];

  const dialogs = (
    <>
      <AssignWorkerDialog
        onOpenChange={setAssignOpen}
        open={assignOpen}
        profile={profile}
      />
      <DeleteMobileProfileDialog
        onDeleted={onDeleted}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        profile={profile}
      />
    </>
  );

  return {
    actions,
    dialogs,
    openAssign: () => setAssignOpen(true),
    openReplace,
  };
}
