"use client";

import type { CreatableEntry } from "@dashseller/trpc/lib/bulk-credentials";
import { Badge } from "@sparkyidea/ui/components/badge";
import { Progress } from "@sparkyidea/ui/components/progress";
import { profileNumber } from "../constants";
import type { BulkPhase, WriteOutcome } from "../hooks/use-bulk-write";
import { BulkEntryRow, type EntryTone } from "./bulk-entry-row";

/**
 * The write pass and its result share one list: the same rows, later
 * outcomes. Once written, a row names itself by the number the database
 * gave it — that is how the operator finds it in the table behind the dialog.
 */
export function BulkWritePass({
  creatable,
  outcomes,
  phase,
}: {
  creatable: CreatableEntry[];
  outcomes: WriteOutcome[];
  phase: BulkPhase;
}) {
  const byPosition = new Map(
    outcomes.map((outcome) => [outcome.position, outcome])
  );
  const settled = outcomes.length;

  const toneOf = (position: number, offset: number): EntryTone => {
    if (byPosition.has(position)) {
      return "created";
    }
    return offset === settled ? "writing" : "queued";
  };

  const messageOf = (position: number, tone: EntryTone): string => {
    const outcome = byPosition.get(position);
    if (outcome) {
      return `Created as ${profileNumber(outcome.id)}`;
    }
    return tone === "writing" ? "Writing…" : "Queued";
  };

  return (
    <div className="flex flex-col gap-4">
      {phase === "writing" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              {settled} of {creatable.length} created
            </span>
          </div>
          <Progress
            value={
              creatable.length === 0
                ? 0
                : Math.round((settled / creatable.length) * 100)
            }
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Badge variant="green-subtle">{settled} created</Badge>
        </div>
      )}

      {creatable.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          {creatable.map((entry, offset) => {
            const tone = toneOf(entry.position, offset);
            return (
              <BulkEntryRow
                app={entry.app}
                key={entry.position}
                message={messageOf(entry.position, tone)}
                position={entry.position}
                tone={tone}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
