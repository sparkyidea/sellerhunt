import type {
  EbayHmacCredentials,
  ShopRefreshTokenCredentials,
} from "@dashseller/db/schema";
import {
  type CredentialIssue,
  checkCredentials,
  MOBILE_PROFILE_APPS,
  type MobileProfileApp,
} from "./mobile-credentials";

/**
 * Staging pass for the admin bulk upload pane: one pasted (or dropped) blob
 * becomes a verdict per entry, before anything is written.
 *
 * Verdicts are structured, never prose — the pane owns the wording, this owns
 * the rules. An entry carries only `app` and `credentials`: the profile's
 * number comes from the database and no worker is named, so nothing here can
 * collide with the pool and there is no duplicate check.
 */

export type EntryVerdict =
  /** Creatable; lands unassigned, numbered by the database. */
  | { kind: "ready" }
  | { kind: "not-object" }
  | { kind: "unknown-app"; app: string }
  | { kind: "no-credentials" }
  | { kind: "credentials"; app: MobileProfileApp; issue: CredentialIssue };

/** The `(app, credentials)` pair, still discriminated — what a write takes. */
export type CredentialPayload =
  | { app: "ebay"; credentials: EbayHmacCredentials }
  | { app: "shop"; credentials: ShopRefreshTokenCredentials };

export interface StagedEntry {
  /** Display app: set as soon as the entry names a known one, verdict aside. */
  app: MobileProfileApp | null;
  /** Non-null once the credentials validate. */
  payload: CredentialPayload | null;
  /** 1-based position in the pane — what the row calls itself until it has a number. */
  position: number;
  verdict: EntryVerdict;
}

export type BulkParse =
  | { ok: true; entries: StagedEntry[] }
  | { ok: false; reason: { kind: "empty" } }
  | { ok: false; reason: { kind: "json"; message: string } }
  | { ok: false; reason: { kind: "not-entries" } };

export type CreatableEntry = CredentialPayload & { position: number };

/** Creatable entries, in pane order — what `createMany` takes. */
export function creatableEntries(entries: StagedEntry[]): CreatableEntry[] {
  const out: CreatableEntry[] = [];
  for (const entry of entries) {
    if (entry.verdict.kind === "ready" && entry.payload) {
      out.push({ ...entry.payload, position: entry.position });
    }
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMobileProfileApp(app: string): app is MobileProfileApp {
  return (MOBILE_PROFILE_APPS as readonly string[]).includes(app);
}

function stageEntry(raw: unknown, position: number): StagedEntry {
  const base = { app: null, position, payload: null };

  if (!isRecord(raw)) {
    return { ...base, verdict: { kind: "not-object" } };
  }

  const rawApp = typeof raw.app === "string" ? raw.app.trim() : "";
  if (!isMobileProfileApp(rawApp)) {
    return { ...base, verdict: { kind: "unknown-app", app: rawApp } };
  }

  if (!isRecord(raw.credentials)) {
    return { ...base, app: rawApp, verdict: { kind: "no-credentials" } };
  }

  const checked = checkCredentials(rawApp, raw.credentials);
  if (!checked.ok) {
    return {
      ...base,
      app: rawApp,
      verdict: { kind: "credentials", app: rawApp, issue: checked.issue },
    };
  }

  return {
    app: rawApp,
    position,
    payload:
      checked.app === "ebay"
        ? ({ app: "ebay", credentials: checked.credentials } as const)
        : ({ app: "shop", credentials: checked.credentials } as const),
    verdict: { kind: "ready" },
  };
}

/**
 * Parse the pane's text into staged entries. Accepts one entry object or an
 * array of them, so a single capture file and a concatenated batch both work.
 */
export function parseBulkEntries(text: string): BulkParse {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: { kind: "empty" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      ok: false,
      reason: {
        kind: "json",
        message: error instanceof Error ? error.message : "could not parse",
      },
    };
  }

  if (!(isRecord(parsed) || Array.isArray(parsed))) {
    return { ok: false, reason: { kind: "not-entries" } };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) {
    return { ok: false, reason: { kind: "not-entries" } };
  }

  return {
    ok: true,
    entries: list.map((raw, offset) => stageEntry(raw, offset + 1)),
  };
}
