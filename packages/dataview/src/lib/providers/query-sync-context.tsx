"use client";

import { createContext, type ReactNode, useContext } from "react";

const QuerySyncContext = createContext(false);

/** Hosts control query synchronization without coupling dataview to routing. */
export function QuerySyncProvider({
  children,
  paused,
}: {
  children: ReactNode;
  paused: boolean;
}) {
  return <QuerySyncContext value={paused}>{children}</QuerySyncContext>;
}

export function useQuerySyncPaused() {
  return useContext(QuerySyncContext);
}
