"use client";

import { Badge } from "@sparkyidea/ui/components/badge";
import { Spinner } from "@sparkyidea/ui/components/spinner";
import { cn } from "@sparkyidea/ui/lib/utils";
import { CircleCheckIcon, CircleDashedIcon, CircleXIcon } from "lucide-react";
import type { ReactNode } from "react";
import { appLabel } from "../constants";

/**
 * One entry in the bulk pane's list, in both passes: the staging verdict and
 * the write outcome. The row is the only error surface the pane has — nothing
 * here becomes a toast, because eight entries would be eight toasts.
 */
export type EntryTone =
  | "ready"
  | "blocked"
  | "queued"
  | "writing"
  | "created"
  | "failed";

const TONE_TEXT: Record<EntryTone, string> = {
  ready: "text-muted-foreground",
  blocked: "text-destructive",
  queued: "text-muted-foreground",
  writing: "text-muted-foreground",
  created: "text-muted-foreground",
  failed: "text-destructive",
};

function ToneIcon({ tone }: { tone: EntryTone }) {
  switch (tone) {
    case "ready":
    case "created":
      return (
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-badge-green" />
      );
    case "blocked":
    case "failed":
      return (
        <CircleXIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      );
    case "writing":
      return (
        <Spinner className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      );
    default:
      return (
        <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      );
  }
}

export function BulkEntryRow({
  app,
  position,
  message,
  tone,
  trailing,
}: {
  app: string | null;
  /** 1-based position in the pane — the entry's only name until it has a number. */
  position: number;
  message: string;
  tone: EntryTone;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 border-t px-3 py-2.5 first:border-t-0",
        tone === "queued" && "opacity-50"
      )}
    >
      <ToneIcon tone={tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground text-xs">
            entry {position}
          </span>
          {app && <Badge variant="secondary">{appLabel(app)}</Badge>}
        </div>
        <p className={cn("text-xs leading-4", TONE_TEXT[tone])}>{message}</p>
      </div>
      {trailing}
    </div>
  );
}
