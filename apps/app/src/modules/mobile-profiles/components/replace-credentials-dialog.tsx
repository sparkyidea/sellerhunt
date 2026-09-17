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
import { FieldGroup } from "@sparkyidea/ui/components/field";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyholeIcon } from "lucide-react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import { appLabel, profileNumber } from "../constants";
import { isCredentialApp } from "../credential-app";
import { type OkCredentials, parseCredentialsJson } from "../credentials-json";
import { useReplaceCredentialsDialog } from "../hooks/use-replace-credentials-dialog";
import {
  CREDENTIALS_JSON_NAME,
  CredentialsJsonField,
} from "./credentials-json-field";

/**
 * Replaces the stored credentials of one profile. App, number and worker
 * assignment are locked to the row — this dialog only swaps the blob;
 * reassigning a box has consequences this dialog does not spell out.
 *
 * Creating profiles does not happen here at all: captures arrive in batches
 * and go through the bulk pane (`MobileProfileDialog`).
 */
export function ReplaceCredentialsDialog() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isOpen = useReplaceCredentialsDialog((s) => s.isOpen);
  const profileId = useReplaceCredentialsDialog((s) => s.profileId);
  const onClose = useReplaceCredentialsDialog((s) => s.onClose);

  // Usually a cache hit: whatever opened this dialog was already showing the
  // profile. Idle for every page that never opens it.
  const { data: profile, isLoading } = useQuery({
    ...trpc.mobileProfile.get.queryOptions({ id: profileId ?? 0 }),
    enabled: isOpen && profileId !== null,
  });

  /** `mobile_profile.app` is free text; only these two have a credential schema. */
  const app = profile && isCredentialApp(profile.app) ? profile.app : null;

  const replace = useMutation(
    trpc.mobileProfile.replaceCredentials.mutationOptions({
      onSuccess: async () => {
        toast.success("Credentials replaced; cached tokens evicted");
        await queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());
        handleOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  function handleOpenChange(next: boolean) {
    if (next) {
      return;
    }
    onClose();
  }

  function submit(parsed: OkCredentials, id: number): void {
    if (parsed.app === "ebay") {
      replace.mutate({ id, app: "ebay", credentials: parsed.credentials });
      return;
    }
    replace.mutate({ id, app: "shop", credentials: parsed.credentials });
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(app && profileId)) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const parsed = parseCredentialsJson(
      String(formData.get(CREDENTIALS_JSON_NAME) ?? ""),
      app
    );
    if (!parsed.ok) {
      if (parsed.tone === "warning") {
        toast.warning(parsed.message);
        return;
      }
      toast.error(parsed.message);
      return;
    }
    submit(parsed, profileId);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              <LockKeyholeIcon />
              Replace credentials
            </DialogTitle>
            <DialogDescription>
              Replaces the stored credentials, evicts the cached bearer and
              refresh token, and aborts any scan currently using this profile
              (it retries in 20 minutes with the new credentials).
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">App</span>
            {profile ? (
              <>
                <Badge variant="secondary">{appLabel(profile.app)}</Badge>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono">{profileNumber(profile.id)}</span>
              </>
            ) : (
              <Skeleton className="h-5 w-40" />
            )}
          </div>

          {app ? (
            <FieldGroup>
              <CredentialsJsonField app={app} disabled={replace.isPending} />
            </FieldGroup>
          ) : (
            <CredentialsFallback app={profile?.app} loading={isLoading} />
          )}

          <DialogFooter>
            <DialogClose
              disabled={replace.isPending}
              render={<Button type="button" variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button disabled={replace.isPending || !app} type="submit">
              {replace.isPending && <Spinner />}
              Replace credentials
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shown while the profile loads, or when its app has no credential schema. */
function CredentialsFallback({
  app,
  loading,
}: {
  app?: string;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-52 w-full" />;
  }
  return (
    <p className="text-destructive text-sm">
      No credential form exists for app "{app}".
    </p>
  );
}
