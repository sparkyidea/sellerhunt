"use client";

import type { CreatableEntry } from "@dashseller/trpc/lib/bulk-credentials";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTRPC } from "@/lib/utils/trpc/client";

/**
 * The write pass behind the bulk pane. Entries go out in small batches rather
 * than one call, so the counter moves while a long paste lands. Each batch is
 * one insert: every entry in it lands or none does.
 *
 * A failed batch is never retried on its own: whatever landed stays landed and
 * keeps its outcome, the pane says which entries did not, and the operator
 * decides. Starting again writes only the entries without an outcome, so a
 * second pass cannot insert a persona twice — `createMany` has no duplicate
 * check.
 */

/** Entries per `createMany` call: small enough that the counter actually moves. */
const BATCH_SIZE = 10;

export type BulkPhase = "stage" | "writing" | "result";

export interface WriteOutcome {
  /** The number the database gave the profile — how the table names it. */
  id: number;
  /** 1-based pane position, so a row can find its own outcome. */
  position: number;
}

function toCreateEntry(entry: CreatableEntry) {
  return entry.app === "ebay"
    ? { app: "ebay" as const, credentials: entry.credentials }
    : { app: "shop" as const, credentials: entry.credentials };
}

function batches(entries: CreatableEntry[]): CreatableEntry[][] {
  const out: CreatableEntry[][] = [];
  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    out.push(entries.slice(start, start + BATCH_SIZE));
  }
  return out;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not create profiles";
}

export function useBulkWrite() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<BulkPhase>("stage");
  const [outcomes, setOutcomes] = useState<WriteOutcome[]>([]);
  /** Why the last pass ended early, until the next pass starts. */
  const [failure, setFailure] = useState<string | null>(null);
  const stopped = useRef(false);
  // The loop reads outcomes across awaits, where state would be stale.
  const landed = useRef<WriteOutcome[]>([]);

  const createMany = useMutation(
    trpc.mobileProfile.createMany.mutationOptions()
  );

  const refresh = () =>
    queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());

  function record(next: WriteOutcome[]) {
    landed.current = next;
    setOutcomes(next);
  }

  async function start(entries: CreatableEntry[]) {
    stopped.current = false;
    setFailure(null);
    setPhase("writing");

    // A later pass writes only what has not landed yet.
    const done = new Set(landed.current.map((outcome) => outcome.position));
    const pending = entries.filter((entry) => !done.has(entry.position));
    try {
      for (const batch of batches(pending)) {
        const result = await createMany.mutateAsync({
          entries: batch.map(toCreateEntry),
        });
        const collected = [...landed.current];
        for (const row of result.results) {
          const entry = batch[row.position];
          if (entry) {
            collected.push({ id: row.id, position: entry.position });
          }
        }
        record(collected);
        if (stopped.current) {
          break;
        }
      }
    } catch (error) {
      setFailure(failureMessage(error));
    }
    await refresh();
    setPhase("result");
  }

  return {
    created: outcomes.length,
    failure,
    outcomes,
    phase,
    reset: () => {
      setPhase("stage");
      record([]);
      setFailure(null);
      stopped.current = false;
    },
    start: (entries: CreatableEntry[]) => {
      start(entries).catch((error: unknown) => {
        setFailure(failureMessage(error));
        setPhase("result");
      });
    },
    stop: () => {
      stopped.current = true;
    },
    stopping: stopped.current,
  };
}
