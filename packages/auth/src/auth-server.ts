import { passkey } from "@better-auth/passkey";
import { db } from "@dashseller/db";
// biome-ignore lint/performance/noNamespaceImport: needed for drizzle schema
import * as schema from "@dashseller/db/schema/auth";
import { env } from "@dashseller/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, emailOTP, organization, twoFactor } from "better-auth/plugins";
import { createElement } from "react";
import { createDefaultWarehouse } from "./actions/create-default-warehouse";
import { createPersonalOrganization } from "./actions/create-personal-organization";
import { DeleteAccountVerificationEmail } from "./components/auth/email/delete-account-verification";
import { OrganizationInvitationEmail } from "./components/auth/email/organization-invitation";
import { OtpEmail } from "./components/auth/email/otp-email";
import { sendEmail } from "./lib/send-email";

const otpSubjects: Record<
  "sign-in" | "email-verification" | "forget-password" | "change-email",
  string
> = {
  "sign-in": "Your DashSeller sign-in code",
  "email-verification": "Verify your email",
  "forget-password": "Reset your password",
  "change-email": "Confirm your new email",
};

// WebAuthn ceremonies run at the APP origin, not the API origin. Under
// cross-subdomain cookies (app.X + api.X) the rpID must be the shared
// registrable domain; in dev it is the app hostname (localhost).
const passkeyRpID = env.COOKIE_DOMAIN
  ? env.COOKIE_DOMAIN.replace(/^\./, "")
  : new URL(env.APP_URL).hostname;

export const authServer = betterAuth({
  baseURL: env.API_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: [env.APP_URL],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 4,
    // No `sendResetPassword` / `resetPasswordTokenExpiresIn`: password reset is
    // OTP-based now (self-contained, expiry from `emailOTP.expiresIn`). Without
    // a sender the legacy link endpoint `/request-password-reset` 400s
    // `RESET_PASSWORD_DISABLED` — deliberate.
    onExistingUserSignUp: () => {
      throw new APIError("UNPROCESSABLE_ENTITY", {
        code: "USER_ALREADY_EXISTS",
      });
    },
  },
  emailVerification: {
    // NEVER re-add `sendVerificationEmail` here. Options merge via
    // `defu(userOptions, pluginInitOptions)` (user config wins), so a sender at
    // this level silently defeats emailOTP's `overrideDefaultEmailVerification`
    // and link-based verification emails resume. Verification codes are sent by
    // the emailOTP plugin below.
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    discord: {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
    },
  },
  user: {
    // No core `changeEmail`: the emailOTP plugin's own `changeEmail` drives the
    // OTP change-email flow. Enabling core change-email would leave a broken
    // link-branch reachable (delete-account stays link-based on purpose).
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        // The emailed link's embedded callbackURL defaults to "/", which the
        // callback resolves against the API origin. Pin it to the app's
        // sign-in page — the account (and session) are gone after confirm.
        const confirmUrl = new URL(url);
        confirmUrl.searchParams.set(
          "callbackURL",
          new URL("/auth/sign-in", env.APP_URL).toString()
        );
        await sendEmail({
          to: user.email,
          subject: "Confirm Account Deletion",
          react: createElement(DeleteAccountVerificationEmail, {
            url: confirmUrl.toString(),
          }),
        });
      },
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: !!env.COOKIE_DOMAIN,
      domain: env.COOKIE_DOMAIN,
    },
    defaultCookieAttributes: {
      sameSite: env.COOKIE_DOMAIN ? "none" : "lax",
    },
  },
  plugins: [
    admin(),
    organization({
      sendInvitationEmail: async ({ email, organization: org, inviter }) => {
        await sendEmail({
          to: email,
          subject: `You've been invited to join ${org.name}`,
          react: createElement(OrganizationInvitationEmail, {
            email,
            inviterName: inviter.user.name || inviter.user.email,
            organizationName: org.name,
            url: `${env.APP_URL}/settings/organizations`,
          }),
        });
      },
      organizationHooks: {
        afterCreateOrganization: async ({
          organization: createdOrganization,
        }) => {
          await createDefaultWarehouse(createdOrganization.id);
        },
      },
    }),
    emailOTP({
      // OTP is a passwordless sign-in for existing accounts only; sign-up stays
      // on the email+password path. Prevents OTP from silently creating accounts
      // (and the account-enumeration that comes with collecting a name only for
      // new addresses). Mirrors the UI plugin's `disableSignUp` default.
      disableSignUp: true,
      // 10 minutes — must match `expirationMinutes` passed to OtpEmail below.
      expiresIn: 600,
      // Sign-up verification emails become codes instead of links (the UI
      // mounts emailOtpPlugin({ emailVerification: true }) to match).
      overrideDefaultEmailVerification: true,
      changeEmail: {
        enabled: true,
        verifyCurrentEmail: true,
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendEmail({
          to: email,
          subject: otpSubjects[type],
          react: createElement(OtpEmail, {
            verificationCode: otp,
            appName: "DashSeller",
            expirationMinutes: 10,
          }),
        });
      },
    }),
    passkey({
      rpID: passkeyRpID,
      rpName: "DashSeller",
      origin: new URL(env.APP_URL).origin,
    }),
    twoFactor({
      // Label shown in the authenticator app next to the account email.
      issuer: "DashSeller",
      // No `otpOptions`: emailed codes are deliberately not a second factor —
      // the challenge offers TOTP + backup codes only (the server includes
      // "otp" in twoFactorMethods solely when `otpOptions.sendOTP` is set).
    }),
  ],
  hooks: {
    // biome-ignore lint/suspicious/useAwait: the middleware handler type requires a Promise return; this guard only throws.
    before: createAuthMiddleware(async (ctx) => {
      // Email OTP is verification/reset/change-email only. Passwordless OTP
      // sign-in would bypass 2FA (Better Auth challenges password sign-in
      // only), so its endpoints are cut off entirely — the UI's `signIn: false`
      // hides the button but the routes stay curl-able without this.
      if (
        ctx.path === "/sign-in/email-otp" ||
        (ctx.path === "/email-otp/send-verification-otp" &&
          ctx.body?.type === "sign-in")
      ) {
        throw new APIError("NOT_FOUND");
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Every signup gets a personal org (the tenant), then a default
          // warehouse owned by that org.
          const organizationId = await createPersonalOrganization(user);
          if (organizationId) {
            await createDefaultWarehouse(organizationId);
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Populate the active organization so request context always has a
          // tenant to scope by.
          const membership = await db.query.member.findFirst({
            where: (m, { eq }) => eq(m.userId, session.userId),
            columns: { organizationId: true },
          });
          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
});
