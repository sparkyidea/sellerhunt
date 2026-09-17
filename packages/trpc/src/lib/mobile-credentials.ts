import type {
  EbayHmacCredentials,
  ShopRefreshTokenCredentials,
} from "@dashseller/db/schema";
import { z } from "zod";

/**
 * Input validation and output redaction for `mobile_profile.credentials`.
 * The blob is encrypted at rest and never returned; the admin UI sees only the
 * allowlisted identifiers below.
 */

export const MOBILE_PROFILE_APPS = ["ebay", "shop"] as const;
export type MobileProfileApp = (typeof MOBILE_PROFILE_APPS)[number];
export const mobileProfileAppSchema = z.enum(MOBILE_PROFILE_APPS);
export const mobileProfileStatusSchema = z.enum(["active", "dead"]);

const nonEmpty = z.string().trim().min(1);

/**
 * The eBay signer does `Buffer.from(hmacKey, "hex")`, which silently turns
 * malformed input into empty or truncated key bytes. Require even-length hex
 * so a bad paste fails here instead of producing unusable signatures.
 */
const hexKey = z
  .string()
  .trim()
  .regex(/^(?:[0-9a-fA-F]{2})+$/, "hmacKey must be even-length hexadecimal");

export const ebayHmacCredentialsSchema = z.strictObject({
  clientId: nonEmpty,
  device4pp: nonEmpty,
  deviceId: nonEmpty,
  guid: nonEmpty,
  hmacKey: hexKey,
  idfa: nonEmpty,
  idfv: nonEmpty,
}) satisfies z.ZodType<EbayHmacCredentials>;

export const shopRefreshTokenCredentialsSchema = z.strictObject({
  deviceId: nonEmpty,
  deviceIdHw: nonEmpty,
  deviceName: nonEmpty,
}) satisfies z.ZodType<ShopRefreshTokenCredentials>;

/** `{ app, credentials }` discriminated on the `app` column value. */
export const credentialsInputSchema = z.discriminatedUnion("app", [
  z.object({ app: z.literal("ebay"), credentials: ebayHmacCredentialsSchema }),
  z.object({
    app: z.literal("shop"),
    credentials: shopRefreshTokenCredentialsSchema,
  }),
]);
export type CredentialsInput = z.infer<typeof credentialsInputSchema>;

/**
 * Identifier fields the admin UI may display. Allowlist, not denylist: any
 * field not named here (secrets like `hmacKey`, opaque attestation blobs like
 * `device4pp`, or unexpected keys in an old blob) stays private.
 */
const PUBLIC_IDENTIFIER_FIELDS: Record<MobileProfileApp, readonly string[]> = {
  ebay: ["clientId", "deviceId", "guid", "idfa", "idfv"],
  shop: ["deviceId", "deviceIdHw", "deviceName"],
};

function isMobileProfileApp(app: string): app is MobileProfileApp {
  return (MOBILE_PROFILE_APPS as readonly string[]).includes(app);
}

/**
 * Pick the displayable identifiers out of a decrypted credentials blob.
 * Returns `null` for unknown apps or malformed blobs — leak nothing.
 */
export function pickPublicIdentifiers(
  app: string,
  raw: unknown
): Record<string, string> | null {
  if (!isMobileProfileApp(app)) {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const blob = raw as Record<string, unknown>;
  const identifiers: Record<string, string> = {};
  for (const field of PUBLIC_IDENTIFIER_FIELDS[app]) {
    const value = blob[field];
    if (typeof value === "string") {
      identifiers[field] = value;
    }
  }
  return identifiers;
}

/**
 * Shape check shared by every credential surface: the replace-credentials
 * dialog and the bulk upload pane. It reports *what* is wrong and leaves the
 * wording to the caller — the two surfaces phrase the same fault differently
 * ("switch App to eBay" only makes sense where an App select exists).
 */

const CREDENTIAL_SCHEMAS = {
  ebay: ebayHmacCredentialsSchema,
  shop: shopRefreshTokenCredentialsSchema,
} as const;

export const OTHER_APP: Record<MobileProfileApp, MobileProfileApp> = {
  ebay: "shop",
  shop: "ebay",
};

export type CredentialIssue =
  | { kind: "other-app"; other: MobileProfileApp }
  | { kind: "missing"; keys: string[] }
  | { kind: "unexpected"; keys: string[] }
  | { kind: "invalid"; key: string; message: string };

export type CheckedCredentials =
  | { ok: true; app: "ebay"; credentials: EbayHmacCredentials }
  | { ok: true; app: "shop"; credentials: ShopRefreshTokenCredentials }
  | { ok: false; issue: CredentialIssue };

/** Required keys for `app`, in schema order — also the placeholder's key list. */
export function credentialKeys(app: MobileProfileApp): string[] {
  return Object.keys(CREDENTIAL_SCHEMAS[app].shape);
}

/** True when the blob validates as the *other* app — a capture under the wrong app. */
function looksLikeOtherApp(app: MobileProfileApp, blob: unknown): boolean {
  return CREDENTIAL_SCHEMAS[OTHER_APP[app]].safeParse(blob).success;
}

export function checkCredentials(
  app: MobileProfileApp,
  blob: Record<string, unknown>
): CheckedCredentials {
  const required = credentialKeys(app);
  const present = Object.keys(blob).filter((key) => blob[key] !== undefined);
  const missing = required.filter((key) => !present.includes(key));
  const unexpected = present.filter((key) => !required.includes(key));

  if (missing.length > 0 && looksLikeOtherApp(app, blob)) {
    return { ok: false, issue: { kind: "other-app", other: OTHER_APP[app] } };
  }
  if (missing.length > 0) {
    return { ok: false, issue: { kind: "missing", keys: missing } };
  }
  if (unexpected.length > 0) {
    return { ok: false, issue: { kind: "unexpected", keys: unexpected } };
  }

  const result = CREDENTIAL_SCHEMAS[app].safeParse(blob);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      issue: {
        kind: "invalid",
        key: String(issue?.path[0] ?? ""),
        message: issue?.message ?? "is not valid",
      },
    };
  }

  return app === "ebay"
    ? { ok: true, app: "ebay", credentials: result.data as EbayHmacCredentials }
    : {
        ok: true,
        app: "shop",
        credentials: result.data as ShopRefreshTokenCredentials,
      };
}
