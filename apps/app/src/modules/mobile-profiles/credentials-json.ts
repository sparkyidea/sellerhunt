import type {
  EbayHmacCredentials,
  ShopRefreshTokenCredentials,
} from "@dashseller/db/schema";
import {
  type CredentialIssue,
  checkCredentials,
  credentialKeys,
} from "@dashseller/trpc/lib/mobile-credentials";
import { appLabel } from "./constants";
import type { CredentialApp } from "./credential-app";

/**
 * Client-side parse of the pasted/dropped credentials blob for the
 * replace-credentials dialog. Same zod schemas the `mobileProfile` router
 * validates with, so a paste that passes here is rejected by the server only
 * for reasons the client cannot see. Every failure carries
 * the finished toast string — that dialog has no inline error surface.
 *
 * The bulk pane runs the same check through `checkCredentials` and words the
 * issues differently; see `bulk-credentials.ts`.
 */

/** Key skeleton shown as the textarea placeholder, so an empty slot still documents the shape. */
export function credentialsPlaceholder(app: CredentialApp): string {
  const keys = credentialKeys(app);
  return `{\n${keys.map((key) => `  "${key}": "…"`).join(",\n")}\n}`;
}

/** Narrowed to the success arm, so `app` still discriminates the credentials type. */
export type OkCredentials = Extract<ParsedCredentials, { ok: true }>;

export type ParsedCredentials =
  | { ok: true; app: "ebay"; credentials: EbayHmacCredentials }
  | { ok: true; app: "shop"; credentials: ShopRefreshTokenCredentials }
  | { ok: false; message: string; tone: "error" | "warning" };

function fail(message: string, tone: "error" | "warning" = "error") {
  return { ok: false as const, message, tone };
}

function list(keys: string[]): string {
  return keys.join(", ");
}

/** `Missing 2 keys for eBay: idfa, idfv` — plural and app name baked in. */
function missingMessage(app: CredentialApp, keys: string[]): string {
  const count = keys.length === 1 ? "1 key" : `${keys.length} keys`;
  return `Missing ${count} for ${appLabel(app)}: ${list(keys)}`;
}

export function readObject(text: string): Record<string, unknown> | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return `Not valid JSON — ${error instanceof Error ? error.message : "could not parse"}`;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "Credentials JSON must be a single object of key/value pairs";
  }
  return parsed as Record<string, unknown>;
}

/** Issue wording for a dialog that owns an App select — the fix is switching it. */
function issueMessage(
  app: CredentialApp,
  issue: CredentialIssue
): { message: string; tone: "error" | "warning" } {
  switch (issue.kind) {
    case "other-app":
      return {
        message: `Those keys look like a ${appLabel(issue.other)} capture — switch App to ${appLabel(issue.other)}`,
        tone: "warning",
      };
    case "missing":
      return { message: missingMessage(app, issue.keys), tone: "error" };
    case "unexpected":
      return {
        message: `Unexpected keys for ${appLabel(app)}: ${list(issue.keys)}`,
        tone: "error",
      };
    default: {
      const prefixed = issue.message.startsWith(issue.key)
        ? issue.message
        : `${issue.key}: ${issue.message}`;
      return {
        message: `${prefixed} (${appLabel(app)} credentials)`,
        tone: "error",
      };
    }
  }
}

export function parseCredentialsJson(
  text: string,
  app: CredentialApp
): ParsedCredentials {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return fail("Paste the credentials JSON, or drop a .json file");
  }

  const blob = readObject(trimmed);
  if (typeof blob === "string") {
    return fail(blob);
  }

  const checked = checkCredentials(app, blob);
  if (checked.ok) {
    return checked;
  }
  const { message, tone } = issueMessage(app, checked.issue);
  return fail(message, tone);
}
