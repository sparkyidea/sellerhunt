"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@sparkyidea/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sparkyidea/ui/components/select";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";
import { STATUS_LABELS } from "../constants";
import type { MobileProfileData } from "../types";

type Status = MobileProfileData["status"];

const STATUS_ITEMS: { label: string; value: Status }[] = [
  { label: STATUS_LABELS.active, value: "active" },
  { label: STATUS_LABELS.dead, value: "dead" },
];

export function MobileProfileStatusForm({
  profile,
}: {
  profile: MobileProfileData;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(profile.status);

  const update = useMutation(
    trpc.mobileProfile.update.mutationOptions({
      onSuccess: async (row) => {
        toast.success(`Status set to ${STATUS_LABELS[row.status]}`);
        await queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const unchanged = status === profile.status;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ id: profile.id, status });
      }}
    >
      <Field>
        <FieldLabel htmlFor="profile-status">Set status</FieldLabel>
        <div className="flex items-center gap-2">
          <Select
            disabled={update.isPending}
            items={STATUS_ITEMS}
            onValueChange={(value) => {
              if (value === "active" || value === "dead") {
                setStatus(value);
              }
            }}
            value={status}
          >
            <SelectTrigger className="flex-1" id="profile-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={update.isPending || unchanged}
            size="sm"
            type="submit"
          >
            {update.isPending && <Spinner />}
            Save
          </Button>
        </div>
        <FieldDescription>
          Reviving does not clear failure counters — use Reset failures. A scan
          already using this profile finishes its run; the next run honours the
          new status.
        </FieldDescription>
      </Field>
    </form>
  );
}
