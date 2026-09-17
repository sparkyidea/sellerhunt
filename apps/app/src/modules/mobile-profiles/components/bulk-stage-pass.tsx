"use client";

import type { StagedEntry } from "@dashseller/trpc/lib/bulk-credentials";
import { Badge } from "@sparkyidea/ui/components/badge";
import { describeEntry, stagedStateOf } from "../bulk-messages";
import { BulkEntryRow } from "./bulk-entry-row";

/**
 * What the pane parsed, before anything is written: a verdict per entry and
 * the counts that decide whether the write button means anything. The rows are
 * the only error surface — eight bad entries would otherwise be eight toasts.
 */
export function BulkStagePass({ entries }: { entries: StagedEntry[] }) {
  const counts = stagedCounts(entries);

  return (
    <>
      <div className="flex items-center gap-1.5">
        {counts.ready > 0 && (
          <Badge variant="green-subtle">{counts.ready} ready</Badge>
        )}
        {counts.blocked > 0 && (
          <Badge variant="red-subtle">{counts.blocked} blocked</Badge>
        )}
        <span className="ml-auto text-muted-foreground text-sm">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        {entries.map((entry) => (
          <BulkEntryRow
            app={entry.app}
            key={entry.position}
            message={describeEntry(entry)}
            position={entry.position}
            tone={stagedStateOf(entry.verdict)}
          />
        ))}
      </div>
    </>
  );
}

/** Entries that will be written, for the footer's count line. */
export function stagedCounts(entries: StagedEntry[]) {
  const counts = { blocked: 0, ready: 0 };
  for (const entry of entries) {
    counts[stagedStateOf(entry.verdict)] += 1;
  }
  return counts;
}
