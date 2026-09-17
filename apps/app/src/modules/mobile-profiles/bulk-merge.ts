import { credentialKeys } from "@dashseller/trpc/lib/mobile-credentials";

/**
 * File drops and the paste pane are one surface: a dropped capture is appended
 * to whatever the pane already holds, as JSON text the operator can still edit.
 * Nothing is validated here — `parseBulkEntries` re-reads the pane afterwards
 * and owns every verdict.
 */

export type MergeResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

function entriesOf(json: unknown): unknown[] | null {
  if (Array.isArray(json)) {
    return json;
  }
  if (typeof json === "object" && json !== null) {
    return [json];
  }
  return null;
}

function readEntries(text: string, source: string): unknown[] | string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return `${source} is not valid JSON`;
  }
  const entries = entriesOf(parsed);
  return entries ?? `${source} holds neither an entry nor a list of them`;
}

/** Append each file's entries to the pane's, as one pretty-printed array. */
export function mergeCaptureText(
  paneText: string,
  files: { name: string; text: string }[]
): MergeResult {
  const current = readEntries(paneText, "The pane");
  if (typeof current === "string") {
    return {
      ok: false,
      message: `${current} — fix it before adding files`,
    };
  }

  const merged = [...current];
  for (const file of files) {
    const entries = readEntries(file.text, file.name);
    if (typeof entries === "string") {
      return { ok: false, message: entries };
    }
    merged.push(...entries);
  }

  return { ok: true, text: JSON.stringify(merged, null, 2) };
}

/** The envelope skeleton the empty pane shows: one entry, every eBay key. */
export function bulkPlaceholder(): string {
  const keys = credentialKeys("ebay")
    .map((key) => `      "${key}": "…"`)
    .join(",\n");
  return `[\n  {\n    "app": "ebay",\n    "credentials": {\n${keys}\n    }\n  }\n]`;
}
