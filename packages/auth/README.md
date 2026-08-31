# @dashseller/auth

Server config (`auth-server.ts`), the auth client wiring, email senders
(`emails/`, `lib/send-email.ts`), and the **Better Auth UI layer** under
`src/components/auth/**` + `src/lib/auth/**`.

## The UI layer is generated — do not hand-edit it

`src/components/auth/**` and `src/lib/auth/**` are **shadcn registry output**
from [better-auth-ui.com](https://better-auth-ui.com), style `base-nova` (the
`@base-ui/react` variant, matching `@sparkyidea/ui`). They are a first-party UI
layer over the headless `@better-auth-ui/core` + `/react` — a sibling of the
official `@better-auth-ui/heroui`, not a fork.

Biome is **off** for both paths (`biome.jsonc`) so they stay byte-faithful to
upstream and re-scaffolding stays a clean diff. `tsc` stays **on** — it is the
drift detector that catches when upstream's API expectations no longer match the
installed `@better-auth-ui` version.

Because biome doesn't touch these files, the only reason they ever differ from a
fresh `shadcn add` is the **local patches** listed at the bottom. Keep that list
short and current.

## Updating Better Auth UI (the smooth path)

1. **Bump the packages** in the root `package.json` catalog (all consumers use
   `catalog:`): `@better-auth-ui/core`, `@better-auth-ui/react`,
   `@better-auth/api-key`, `@better-auth/passkey`, `better-auth`. Match the
   version's peer floors (`better-call`, `@tanstack/react-query`,
   `tailwind-merge`, `tailwindcss`, `@mikkelscheike/email-provider-links`).
   `bun install`. **Do not run `npx auth upgrade`** — it rewrites `catalog:`
   refs to literal versions across every package.

2. **Aliases must be correct** in `components.json` before scaffolding —
   `"lib": "@dashseller/auth/lib"` and `"components": "@dashseller/auth/components"`
   (NOT `@sparkyidea/ui/...`, or the CLI writes plugin/lib files into the wrong
   package).

3. **Preserve local-only files** (no registry owner):
   - `src/components/auth/section-header.tsx`
   - `src/components/auth/organization/organization-detail.tsx`

4. **Wipe and re-scaffold** from `packages/auth` with shadcn v4 (`base-nova` is
   a v4 style):

   ```bash
   rm -rf src/components/auth src/lib/auth
   R=https://better-auth-ui.com/r/base-nova
   bunx shadcn@latest add -y -o \
     $R/auth.json $R/settings.json $R/user-button.json \
     $R/organization.json $R/api-key.json $R/passkey.json \
     $R/email-otp.json $R/two-factor.json $R/delete-user.json $R/additional-field.json \
     $R/delete-account-verification-email.json $R/password-changed-email.json \
     $R/email-changed-email.json $R/otp-email.json $R/new-device-email.json \
     $R/organization-invitation-email.json
   ```

   Use only `base-nova/` URLs. **Never `all.json`** — it hard-codes `radix-nova`.

5. **Revert the collateral damage** the CLI does outside `packages/auth`:
   - `git checkout -- packages/ui/src packages/ui/package.json` — the CLI
     resolves the `ui` alias to the `@sparkyidea/ui` workspace and overwrites its
     primitives + `globals.css`, and re-adds `@better-auth-ui/*` / `better-auth`
     to its `package.json`. None of that belongs to this package.
   - Re-remove the dead `@better-auth-ui/*` / `@better-auth/passkey` / `better-auth`
     deps from `packages/ui/package.json` (nothing in its `src/` imports them).
     **Leave `apps/app`'s `@better-auth/passkey`** — it is a real dependency now
     (`auth-client.ts` imports `passkeyClient`).
   - If the CLI rewrote `packages/auth/package.json` `catalog:` deps to literals,
     restore `catalog:`.
   - If it wrote a stray `src/components/ui/` into `packages/auth`, delete it.

6. **Re-apply the local patches** (see below), then
   `bun run check-types && bun run build`.

## Local patches (must survive every re-scaffold)

- **`AuthPluginRegister` augmentation lives in `components/auth/auth-provider.tsx`,
  not `lib/auth/auth-plugin.ts`.** The registry authors it in `auth-plugin.ts`,
  but nothing imports that module, so its `declare module` never enters an app's
  TS program and `useAuth().plugins` silently falls back to the un-widened base
  type (a large `app#build` failure that `packages/auth`'s own `tsc` does not
  catch). Move the `interface AuthPluginRegister { shadcn: AuthPlugin }` block
  into `auth-provider.tsx` (always reached — `<AuthProvider>` renders every auth
  view) and delete it from `auth-plugin.ts`. Both files carry a `LOCAL PATCH`
  comment.
- **Keep `src/lib/utils.ts`.** The generated email templates import `cn` via a
  relative `../../../lib/utils`, so this file must exist. It is byte-identical to
  `@sparkyidea/ui/lib/utils`.
- **`/** @jsxImportSource react */` on every `components/auth/email/*.tsx`.**
  `apps/api` builds with `jsxImportSource: hono/jsx`, and it type-checks
  `auth-server.ts` (which imports these email components) as raw source — so
  without the per-file pragma their React JSX resolves against `hono/jsx` and
  fails with TS2875. The registry ships them with no pragma; prepend it after
  each re-scaffold. (The old `emails/*.tsx` carried the same pragma.)
- **`change-email-otp.tsx` current-email challenge is `type: "email-verification"`,
  not `type: "change-email"`.** The registry ships (as of 2026-08) the
  current-email OTP request as `type: "change-email"`, but
  `/email-otp/send-verification-otp` rejects that type with 400 "Invalid OTP
  type", and `/email-otp/request-email-change` verifies the current-email code
  against the `email-verification` identifier. Without this one-token change the
  three-step change-email flow 400s on step one. Line ~146.
- **Email sending uses `components/auth/email/*`, not a local `emails/` dir.**
  `auth-server.ts` renders the registry email templates via
  `createElement(ResetPasswordEmail, { url })` etc. (it is a `.ts` file, so no
  JSX) and supplies its own `subject` strings. There is no
  `packages/auth/src/emails/` dir anymore.
- **Two preserved files** (step 3) are restored after the wipe.
  `organization-detail.tsx` imports the org hooks/types from the 1.7 module
  paths (`@better-auth-ui/react/plugins/organization`,
  `@better-auth-ui/core/plugins/organization`).
- **Section headers.** The 11 settings/organization cards use upstream's inline
  header. We deliberately do **not** re-apply the local `SectionHeader` (fixed
  `h-7` height) to them — that would be an 11-file patch to carry forever, for a
  minor anti-layout-jump refinement. `section-header.tsx` stays only because
  `apps/app`'s `appearance-settings.tsx` uses it. If the page-to-page layout
  jump becomes a problem, re-applying `SectionHeader` is the fix — as a recorded
  patch here.

## Plugins — what's enabled, dormant, and removed

Three wiring points decide whether a plugin does anything:

- **Server** — `packages/auth/src/auth-server.ts` `plugins: [...]`
- **Client** — `apps/app/src/lib/auth-client.ts` `plugins: [...]`
- **UI mount** — `apps/app/src/components/providers/wrappers/better-auth-providers.tsx`
  `<AuthProvider plugins={[...]}>` (a plugin's cards/buttons/views only render
  when it is mounted here)

| Plugin | Server | Client | UI mounted | State |
| --- | :---: | :---: | :---: | --- |
| Organization | `organization()` | `organizationClient()` | `organizationPlugin()` | **enabled** end-to-end |
| Delete User | built-in `user.deleteUser` + `sendDeleteAccountVerification` | — | `deleteUserPlugin({ sendDeleteAccountVerification: true })` | **enabled** — the UI flag must mirror the server sender ("set both or neither"): without it the dialog asks for a password and toasts "deleted" while the server only emailed the confirmation link |
| Admin | `admin()` | `adminClient()` | `adminPlugin()` | **enabled** — schema (`role`/`banned`/`impersonatedBy`) + the stop-impersonating user-menu item |
| Email OTP | `emailOTP({ disableSignUp, overrideDefaultEmailVerification, changeEmail })` + root `hooks.before` | `emailOTPClient()` | `emailOtpPlugin({ signIn: false, emailVerification, passwordReset, changeEmail, verifyCurrentEmail })` | **enabled for codes only** — **sign-up verification** (via `overrideDefaultEmailVerification`), **password reset**, and **change-email** (`verifyCurrentEmail`: code to the old address, then the new). Passwordless **sign-in is removed** (`signIn: false` drops the button/view; `hooks.before` 404s `/sign-in/email-otp` and sign-in-type code sends) so it can't bypass 2FA. `disableSignUp` keeps sign-up on the password path. Delete-account stays link-based |
| Passkey | `passkey({ rpID, rpName, origin })` | `passkeyClient()` | `passkeyPlugin()` | **enabled** — add/manage passkeys (Settings → Security) + "Continue with Passkey" sign-in; backed by the `passkey` DB table |
| Two Factor | `twoFactor({ issuer })` | `twoFactorClient()` | `twoFactorPlugin()` | **enabled** — TOTP + backup codes, challenge at `/auth/two-factor`, enroll in Settings → Security. Emailed 2FA codes deliberately unconfigured (no `otpOptions`), so the challenge offers TOTP + backup only. Enrollment is password-gated; passkey / Google / Discord sign-in skip the challenge by design |
| API Key | — | — | — | **installed, dormant** |
| Last Login Method | — | — | — | **installed, dormant** |
| Billing | — | — | — | **installed, dormant** (kept for the planned Stripe track) |

"Installed, dormant" = the UI files exist under `components/auth/**` + `lib/auth/*-plugin.ts`
but nothing is wired. **To activate one:** add its server plugin in `auth-server.ts`,
its client plugin in `auth-client.ts` (if it needs one), and mount `xPlugin()` in
`better-auth-providers.tsx`. If the plugin contributes an **auth view path** (e.g.
two-factor's `/auth/two-factor`), also merge its `viewPaths.auth` into the allowed
set in `apps/app/src/app/auth/[path]/page.tsx` (see how two-factor does it) or that
route 404s. Inverse case worth knowing: email-otp's core plugin contributes the
`/auth/email-otp` segment **unconditionally**, but with `signIn: false` no view
mounts there — so its merge was deliberately removed and that segment now 404s.

**Removed — deliberately NOT installed** (do not re-add on a re-scaffold without a
reason): Multi Session, Magic Link, Username, Captcha, Phone Number, One Tap,
SSO / Email-First Sign-In, SIWE (Sign in with Ethereum), OAuth Provider, Device
Authorization, Anonymous, Agent Auth, Theme. (Multi Session / Magic Link / Username
were dormant scaffold — never wired on server, client, or UI — and their registry
items + component files were deleted; drop them from the scaffold command too.)

**Built-in (non-plugin) features enabled** in `auth-server.ts`: email + password
(verification required, now satisfied by an OTP code), and Google + Discord social
login. Core `user.changeEmail` and the link-based password-reset endpoint
(`/request-password-reset`, which 400s `RESET_PASSWORD_DISABLED`) are now
**disabled** — both flows run through email OTP instead. Delete-account stays
link-verified via `withAppCallback` (emailOTP 1.7.1 has no delete-account OTP type).
