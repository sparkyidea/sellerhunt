import type { authServer } from "@dashseller/auth/auth-server";
import type { JobClient } from "@dashseller/job-client";

export type Session = Awaited<ReturnType<typeof authServer.api.getSession>>;
export type SessionReader = (headers: Headers) => Promise<Session>;

/**
 * Process-level dependencies the host injects. `jobs` is the app's ONE
 * shared BullMQ producer (created at boot, closed on shutdown) — mutations
 * that need background work enqueue through it instead of talking to a
 * job runner directly.
 */
export interface ContextDeps {
  jobs: JobClient;
}

/**
 * Framework-agnostic context creation. Each app supplies its own session
 * reader: apps/api passes the in-process `auth.api.getSession`; apps/app
 * passes an HTTP reader that forwards the cookie to apps/api.
 */
export async function createContext(
  headers: Headers,
  getSession: SessionReader,
  deps: ContextDeps
) {
  const session = await getSession(headers);
  return { session, jobs: deps.jobs };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
