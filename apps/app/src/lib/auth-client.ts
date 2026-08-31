import { passkeyClient } from "@better-auth/passkey/client";
import type { authServer } from "@dashseller/auth/auth-server";
import { env } from "@dashseller/env/app";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  plugins: [
    inferAdditionalFields<typeof authServer>(),
    emailOTPClient(),
    adminClient(),
    organizationClient(),
    passkeyClient(),
    twoFactorClient(),
  ],
});

export const {
  signIn,
  signUp,
  useSession,
  forgetPassword,
  resetPassword,
  signOut,
  verifyEmail,
  emailOtp,
} = authClient;
