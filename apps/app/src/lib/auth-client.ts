import { buildAuthClient } from "@dashseller/auth/auth-client";
import { env } from "@dashseller/env/app";

export const authClient = buildAuthClient(env.NEXT_PUBLIC_API_URL);

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
