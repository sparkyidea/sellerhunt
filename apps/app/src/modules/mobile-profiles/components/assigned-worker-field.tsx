"use client";

import { isWorkerHostname } from "@dashseller/db/lib/worker-hostname";
import { Button } from "@sparkyidea/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@sparkyidea/ui/components/field";
import { Input } from "@sparkyidea/ui/components/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@sparkyidea/ui/components/tooltip";
import { InfoIcon } from "lucide-react";
import { ASSIGNED_WORKER_HELP } from "../constants";

/** Under the input: what the typed hostname will do, or why it cannot be stored. */
export function describeAssignment(hostname: string): string {
  const trimmed = hostname.trim();
  if (trimmed.length === 0) {
    return ASSIGNED_WORKER_HELP;
  }
  if (isWorkerHostname(trimmed)) {
    return `Box ${trimmed} selects this profile on its next run.`;
  }
  return "Not a hostname: letters, digits and hyphens only.";
}

/**
 * Consequence text for a reassignment. Both halves are spelled out because
 * the assignment decides which box uses the persona, so moving it has a loser
 * and a winner.
 */
export function describeReassignment(
  current: string | null,
  next: string
): string[] {
  const loses = current
    ? `Box ${current} loses this profile immediately; on its next run it claims a free profile, or fails to load one if none is free.`
    : "No box currently uses this profile; the next box without one would claim it.";
  const trimmed = next.trim();
  let gains = "Enter the box hostname to see what changes.";
  if (trimmed.length > 0) {
    gains = isWorkerHostname(trimmed)
      ? `Box ${trimmed} selects it on its next run.`
      : "That value cannot be stored.";
  }
  return [loses, gains];
}

export function AssignedWorkerField({
  value,
  onChange,
  error,
  disabled,
  id = "profile-assigned-worker",
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel className="gap-0.5" htmlFor={id}>
        Worker hostname
        {/* Local provider: nothing mounts one app-wide, and the base-ui default wait is ~600ms. */}
        <TooltipProvider delay={200}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="What the worker assignment does"
                  className="-my-1 size-4 text-muted-foreground"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <InfoIcon />
            </TooltipTrigger>
            <TooltipContent>{ASSIGNED_WORKER_HELP}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </FieldLabel>
      <Input
        autoComplete="off"
        className="font-mono"
        disabled={disabled}
        id={id}
        name="assignedWorker"
        onChange={(event) => onChange(event.target.value)}
        placeholder="w-00003-orc-e2cpu1ram1-sparkyideainc"
        required
        spellCheck={false}
        value={value}
      />
      <FieldDescription>{describeAssignment(value)}</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
