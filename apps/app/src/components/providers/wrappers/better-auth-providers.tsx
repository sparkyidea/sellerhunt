"use client";

import { AuthProvider } from "@dashseller/auth/components/auth/auth-provider";
import { adminPlugin } from "@dashseller/auth/lib/auth/admin-plugin";
import { deleteUserPlugin } from "@dashseller/auth/lib/auth/delete-user-plugin";
import { emailOtpPlugin } from "@dashseller/auth/lib/auth/email-otp-plugin";
import { organizationPlugin } from "@dashseller/auth/lib/auth/organization-plugin";
import { passkeyPlugin } from "@dashseller/auth/lib/auth/passkey-plugin";
import { twoFactorPlugin } from "@dashseller/auth/lib/auth/two-factor-plugin";
import { env } from "@dashseller/env/app";
import type { Route } from "next";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

function Link({
  href,
  ...props
}: Omit<ComponentProps<typeof NextLink>, "href"> & { href: string }) {
  return <NextLink href={href as Route} {...props} />;
}

export function BetterAuthProviders({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <AuthProvider
      authClient={authClient}
      basePaths={{ organization: "/settings/organizations" }}
      baseURL={env.NEXT_PUBLIC_APP_URL}
      emailAndPassword={{
        requireEmailVerification: true,
      }}
      Link={Link}
      navigate={({ to, replace }) =>
        replace ? router.replace(to as Route) : router.push(to as Route)
      }
      plugins={[
        organizationPlugin(),
        deleteUserPlugin({ sendDeleteAccountVerification: true }),
        adminPlugin(),
        emailOtpPlugin({
          // Passwordless OTP sign-in removed: it would bypass the 2FA challenge
          // (Better Auth challenges password sign-in only). Codes stay for
          // verify-email / password-reset / change-email.
          signIn: false,
          emailVerification: true,
          passwordReset: true,
          changeEmail: true,
          verifyCurrentEmail: true,
        }),
        passkeyPlugin(),
        twoFactorPlugin(),
      ]}
      socialProviders={["google", "discord"]}
    >
      {children}
    </AuthProvider>
  );
}
