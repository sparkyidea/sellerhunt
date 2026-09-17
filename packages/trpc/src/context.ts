import type { authServer } from "@dashseller/auth/auth-server";

export type Session = Awaited<ReturnType<typeof authServer.api.getSession>>;
export type SessionReader = (headers: Headers) => Promise<Session>;

export interface ContextOptions {
  /**
   * JWE key for `mobile_profile` credentials/bearers (the deployment's
   * `ENCRYPTION_SECRET`). Injected by the app, like the session reader, so
   * this package never imports a deployment env.
   */
  encryptionKey: string;
}

/**
 * Framework-agnostic context creation. Each app supplies its own session
 * reader (Hono passes `authServer.api.getSession`) and secrets.
 */
export async function createContext(
  headers: Headers,
  getSession: SessionReader,
  options: ContextOptions
) {
  const session = await getSession(headers);
  return { session, encryptionKey: options.encryptionKey };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
