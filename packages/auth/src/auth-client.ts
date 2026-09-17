import { passkeyClient } from "@better-auth/passkey/client";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { authServer } from "./auth-server";
import { ac, roles } from "./lib/auth/permissions";

/**
 * The one client plugin set, mirroring the server plugins in `auth-server.ts`.
 * The Next.js app (`apps/app`) builds its client from here
 * with its own public API URL, so the two apps cannot drift apart on which
 * auth features exist. `authServer` is a type-only import: this file pulls in
 * no server env.
 */
export function buildAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      inferAdditionalFields<typeof authServer>(),
      emailOTPClient(),
      adminClient({ ac, roles }),
      passkeyClient(),
      twoFactorClient(),
    ],
  });
}

export type AuthClient = ReturnType<typeof buildAuthClient>;
