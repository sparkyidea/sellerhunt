"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { cn } from "@sparkyidea/ui/lib/utils";
import { CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type SaveBarEntry,
  useContextualSaveBar,
} from "@/hooks/use-contextual-save-bar";

const ATTENTION_DURATION_MS = 800;

export function ContextualSaveBar() {
  const active = useContextualSaveBar((s) => s.active);
  const attentionTick = useContextualSaveBar((s) => s.attentionTick);
  const lastActiveRef = useRef<SaveBarEntry | null>(active);
  const [attention, setAttention] = useState(false);

  useEffect(() => {
    if (active) {
      lastActiveRef.current = active;
    }
  }, [active]);

  useEffect(() => {
    if (attentionTick === 0) {
      return;
    }
    setAttention(true);
    const timeout = window.setTimeout(
      () => setAttention(false),
      ATTENTION_DURATION_MS
    );
    return () => window.clearTimeout(timeout);
  }, [attentionTick]);

  const entry = active ?? lastActiveRef.current;

  if (!entry) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex h-9 w-full items-center gap-1 rounded-lg pr-1 pl-3 transition-colors duration-200",
        attention ? "animate-shake-attention bg-destructive/20" : "bg-secondary"
      )}
    >
      <CircleAlert
        className={cn(
          "size-4 shrink-0 transition-colors duration-200",
          attention ? "text-destructive" : "text-secondary-foreground"
        )}
      />
      <span
        className={cn(
          "flex-1 truncate text-sm transition-colors duration-200",
          attention ? "text-destructive" : "text-secondary-foreground"
        )}
      >
        {entry.message ?? "Unsaved changes"}
      </span>
      <Button
        disabled={entry.discardDisabled}
        onClick={entry.onDiscard}
        size="sm"
      >
        Discard
      </Button>
      <Button
        disabled={entry.saveDisabled}
        onClick={() => {
          entry.onSave();
        }}
        size="sm"
      >
        {entry.saving && <Loader2 className="animate-spin" />}
        Save
      </Button>
    </div>
  );
}
