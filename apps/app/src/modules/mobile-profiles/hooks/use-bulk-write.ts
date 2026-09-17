"use client";

import type { CreatableEntry } from "@dashseller/trpc/lib/bulk-credentials";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/utils/trpc/client";

/**
 * The write pass behind the bulk pane. Entries go out in small batches rather
 * than one call, so the counter moves while a long paste lands. Each batch is
 * one insert: every entry in it lands or none does.
 *
 * A failed batch is never retried here: whatever landed stays landed, the
 * outcome list says which entries did, and the operator decides.
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

export function useBulkWrite() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<BulkPhase>("stage");
  const [outcomes, setOutcomes] = useState<WriteOutcome[]>([]);
  const stopped = useRef(false);

  const createMany = useMutation(
    trpc.mobileProfile.createMany.mutationOptions()
  );

  const refresh = () =>
    queryClient.invalidateQueries(trpc.mobileProfile.pathFilter());

  async function start(entries: CreatableEntry[]) {
    stopped.current = false;
    setOutcomes([]);
    setPhase("writing");

    const collected: WriteOutcome[] = [];
    try {
      for (const batch of batches(entries)) {
        const result = await createMany.mutateAsync({
          entries: batch.map(toCreateEntry),
        });
        for (const row of result.results) {
          const entry = batch[row.position];
          if (entry) {
            collected.push({ id: row.id, position: entry.position });
          }
        }
        setOutcomes([...collected]);
        if (stopped.current) {
          break;
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create profiles"
      );
      setPhase("stage");
      await refresh();
      return;
    }

    await refresh();
    setPhase("result");
  }

  return {
    created: outcomes.length,
    outcomes,
    phase,
    reset: () => {
      setPhase("stage");
      setOutcomes([]);
      stopped.current = false;
    },
    start: (entries: CreatableEntry[]) => {
      start(entries).catch(() => {
        toast.error("Could not create profiles");
        setPhase("stage");
      });
    },
    stop: () => {
      stopped.current = true;
    },
    stopping: stopped.current,
  };
}
