import type { authServer } from "@dashseller/auth/auth-server";

export type Session = Awaited<ReturnType<typeof authServer.api.getSession>>;
export type SessionReader = (headers: Headers) => Promise<Session>;

/**
 * Framework-agnostic context creation. Each app supplies its own session
 * reader: apps/api passes the in-process `authServer.api.getSession`; apps/app
 * passes an HTTP reader that forwards the cookie to apps/api.
 */
export async function createContext(
  headers: Headers,
  getSession: SessionReader
) {
  const session = await getSession(headers);
  return { session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
