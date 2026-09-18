"use client";

import { useEffect, useState } from "react";

/**
 * Retained views must not consume another route's query. On resume, keep the
 * snapshot for the first commit: nuqs synchronizes its URL values in effects.
 * This effect runs after those hooks, releasing the snapshot in the same batch.
 */
export function useRetainedQueryState<T>(value: T, syncWithUrl: boolean): T {
  const [wasSyncing, setWasSyncing] = useState(syncWithUrl);
  const [retained, setRetained] = useState(value);
  const syncing = syncWithUrl && wasSyncing;

  if (syncing && retained !== value) {
    setRetained(value);
  }

  useEffect(() => {
    setWasSyncing(syncWithUrl);
  }, [syncWithUrl]);

  return syncing ? value : retained;
}
