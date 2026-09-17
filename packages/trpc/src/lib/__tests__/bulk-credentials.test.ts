import { describe, expect, it } from "bun:test";
import {
  creatableEntries,
  parseBulkEntries,
  type StagedEntry,
} from "../bulk-credentials";

const EBAY = {
  clientId: "client",
  device4pp: "attestation",
  deviceId: "device",
  guid: "guid",
  hmacKey: "deadbeef",
  idfa: "idfa",
  idfv: "idfv",
};
const SHOP = {
  deviceId: "device",
  deviceIdHw: "hardware",
  deviceName: "iPhone",
};

const ebayEntry = { app: "ebay", credentials: EBAY };
const shopEntry = { app: "shop", credentials: SHOP };

function entries(text: string): StagedEntry[] {
  const parsed = parseBulkEntries(text);
  if (!parsed.ok) {
    throw new Error(`expected entries, got ${parsed.reason.kind}`);
  }
  return parsed.entries;
}

describe("parseBulkEntries", () => {
  it("refuses empty text", () => {
    const parsed = parseBulkEntries("   ");
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason.kind).toBe("empty");
  });

  it("reports the JSON error rather than a verdict", () => {
    const parsed = parseBulkEntries("{ nope }");
    expect(parsed.ok === false && parsed.reason.kind).toBe("json");
  });

  it("rejects JSON that is neither an entry nor a list of them", () => {
    expect(parseBulkEntries('"a string"').ok).toBe(false);
    expect(parseBulkEntries("[]").ok).toBe(false);
  });

  it("accepts a single entry object and numbers its position from 1", () => {
    const staged = entries(JSON.stringify(ebayEntry));
    expect(staged).toHaveLength(1);
    expect(staged[0]?.position).toBe(1);
    expect(staged[0]?.verdict.kind).toBe("ready");
    expect(staged[0]?.app).toBe("ebay");
  });

  it("accepts an array and keeps pane order", () => {
    const staged = entries(JSON.stringify([ebayEntry, shopEntry]));
    expect(staged.map((entry) => entry.position)).toEqual([1, 2]);
    expect(staged.map((entry) => entry.app)).toEqual(["ebay", "shop"]);
  });

  it("stages the same capture twice: nothing on an entry can collide", () => {
    const staged = entries(JSON.stringify([ebayEntry, ebayEntry]));
    expect(staged.map((entry) => entry.verdict.kind)).toEqual([
      "ready",
      "ready",
    ]);
    expect(creatableEntries(staged)).toHaveLength(2);
  });

  it("ignores name and worker keys on the entry: upload never assigns", () => {
    const staged = entries(
      JSON.stringify({
        ...ebayEntry,
        label: "w-00012",
        assignedWorker: "w-00001-orc-e2cpu1ram1-sparkyideainc",
      })
    );
    expect(staged[0]?.verdict.kind).toBe("ready");
    expect(creatableEntries(staged)[0]).toEqual({
      app: "ebay",
      credentials: EBAY,
      position: 1,
    });
  });

  it("blocks an app with no credential schema", () => {
    const staged = entries(JSON.stringify({ app: "etsy", credentials: {} }));
    expect(staged[0]?.verdict).toEqual({ kind: "unknown-app", app: "etsy" });
  });

  it("blocks an entry whose credentials are not an object", () => {
    const staged = entries(JSON.stringify({ app: "ebay", credentials: "…" }));
    expect(staged[0]?.verdict.kind).toBe("no-credentials");
  });

  it("carries the credential issue through for missing keys", () => {
    const { idfa: _idfa, idfv: _idfv, ...partial } = EBAY;
    const staged = entries(
      JSON.stringify({ app: "ebay", credentials: partial })
    );
    const verdict = staged[0]?.verdict;
    expect(verdict?.kind).toBe("credentials");
    expect(verdict?.kind === "credentials" && verdict.issue).toEqual({
      kind: "missing",
      keys: ["idfa", "idfv"],
    });
  });

  it("names the other app when the capture sits under the wrong one", () => {
    const staged = entries(JSON.stringify({ app: "ebay", credentials: SHOP }));
    const verdict = staged[0]?.verdict;
    expect(verdict?.kind === "credentials" && verdict.issue).toEqual({
      kind: "other-app",
      other: "shop",
    });
  });

  it("blocks a non-object entry inside the array", () => {
    const staged = entries(JSON.stringify([ebayEntry, 42]));
    expect(staged[1]?.verdict.kind).toBe("not-object");
  });
});

describe("creatableEntries", () => {
  it("keeps ready entries with their pane position, drops every blocked one", () => {
    const staged = entries(
      JSON.stringify([
        ebayEntry,
        { app: "etsy", credentials: {} },
        shopEntry,
        { app: "ebay", credentials: SHOP },
      ])
    );
    expect(creatableEntries(staged).map((entry) => entry.position)).toEqual([
      1, 3,
    ]);
    expect(creatableEntries(staged).map((entry) => entry.app)).toEqual([
      "ebay",
      "shop",
    ]);
  });
});
