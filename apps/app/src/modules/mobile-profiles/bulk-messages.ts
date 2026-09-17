import type {
  BulkParse,
  EntryVerdict,
  StagedEntry,
} from "@dashseller/trpc/lib/bulk-credentials";
import type { CredentialIssue } from "@dashseller/trpc/lib/mobile-credentials";
import { appLabel } from "./constants";

/**
 * Wording for the bulk pane. `parseBulkEntries` decides what is wrong;
 * this file decides how the row says it, so the rules stay testable and the
 * copy stays where the design is.
 */

/** How a staged row reads: creatable, or skipped. */
export type StagedState = "ready" | "blocked";

export function stagedStateOf(verdict: EntryVerdict): StagedState {
  return verdict.kind === "ready" ? "ready" : "blocked";
}

function list(keys: string[]): string {
  return keys.join(", ");
}

/** `Missing 2 keys for eBay: idfa, idfv` — plural and app name baked in. */
function missingMessage(app: string, keys: string[]): string {
  const count = keys.length === 1 ? "1 key" : `${keys.length} keys`;
  return `Missing ${count} for ${appLabel(app)}: ${list(keys)}`;
}

function credentialsMessage(app: string, issue: CredentialIssue): string {
  switch (issue.kind) {
    case "other-app":
      return `Those credentials are a ${appLabel(issue.other)} capture, but the entry says ${appLabel(app)}.`;
    case "missing":
      return missingMessage(app, issue.keys);
    case "unexpected":
      return `Unexpected keys for ${appLabel(app)}: ${list(issue.keys)}`;
    default:
      return issue.message.startsWith(issue.key)
        ? issue.message
        : `${issue.key}: ${issue.message}`;
  }
}

/** One sentence per row: what happens if this entry is written, or why it is not. */
export function describeEntry(entry: StagedEntry): string {
  const { verdict } = entry;
  switch (verdict.kind) {
    case "ready":
      return "Created unassigned and numbered. The next box without a profile claims it.";
    case "not-object":
      return "Not an entry object. Every entry needs app and credentials.";
    case "unknown-app":
      return verdict.app.length === 0
        ? 'Every entry needs an app: "ebay" or "shop".'
        : `Unknown app "${verdict.app}" — no credential schema exists.`;
    case "no-credentials":
      return "Entry carries no credentials object.";
    default:
      return credentialsMessage(verdict.app, verdict.issue);
  }
}

/** Why the pane holds no entries at all: the text never became a list. */
export function describeParseFailure(
  parse: Extract<BulkParse, { ok: false }>
): string {
  switch (parse.reason.kind) {
    case "empty":
      return "Paste the credentials JSON, or drop .json files";
    case "json":
      return `Not valid JSON — ${parse.reason.message}`;
    default:
      return "Paste one entry object, or an array of them";
  }
}
