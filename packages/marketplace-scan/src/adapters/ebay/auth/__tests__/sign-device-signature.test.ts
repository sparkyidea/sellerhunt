/**
 * Algorithm-parity tests for the eBay device-signature signer.
 *
 * The fixtures below are SYNTHETIC — randomly generated, not a real device
 * persona — so this file is safe to commit. The expected signatures were
 * computed by running `signDeviceSignature` against the synthetic key, so
 * the tests are a pinned-input regression net for the canonical-JSON form
 * (key order, slash escaping, no whitespace) and the HMAC-SHA512 wiring.
 *
 * If these tests fail, the canonicalization or HMAC primitive has drifted —
 * which would cause eBay to reject the auth request in production.
 *
 * Real device personas live ONLY in `mobile_profile.credentials` (encrypted)
 * and operator-side `.env` files (gitignored). Never paste a captured
 * `hmacKey` into this file.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalDeviceSignature,
  signDeviceSignature,
} from "../sign-device-signature";

// Synthetic persona generated via `randomBytes(64).toString("hex")`,
// `randomBytes(48).toString("base64")`, `randomUUID().toUpperCase()`.
// Forward slashes in device4pp are deliberate — they exercise the
// canonical-form `\/` escaping.
const FIXTURE = {
  hmacKey:
    "ed29c94ab29e4dca2644a4ca1a02fa53fc604a3ba69f7e43977ccbf018ae2b18" +
    "ce2976f517e899d962c1dc258b4d7b79796e96050268ff6cfa1ba3e3ee57ad67",
  device4pp:
    "AQADJZyhcuFFX6E2TocJor2YtqPk/tc5IZoUZtWyS/JnEC30gvQ1Xb7TLiUPmb/U4Qmj",
  idfa: "2694BB4B-B841-44E3-8507-923FB7B1ECB4",
  idfv: "E1410381-6205-49C2-9133-20B41E337248",
};

// `Date.prototype.toISOString()` format: YYYY-MM-DDTHH:MM:SS.sssZ
const ISO_MS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("signDeviceSignature", () => {
  it("produces the pinned signature for fixture timestamp 2030-01-01", () => {
    const result = signDeviceSignature({
      ...FIXTURE,
      timestampIso: "2030-01-01T00:00:00.000Z",
    });
    expect(result.hmac).toBe(
      "8S8w/eqN1jhWGZ4tBSCkgPC/4WyBh9tTf0wA58kbI3XzzZ9PepNw1ZbhgRzHtd+6Wpwuja+qMdHH7VgtOShqIw=="
    );
    expect(result.timestampIso).toBe("2030-01-01T00:00:00.000Z");
  });

  it("produces the pinned signature for fixture timestamp 2030-06-15", () => {
    const result = signDeviceSignature({
      ...FIXTURE,
      timestampIso: "2030-06-15T12:34:56.789Z",
    });
    expect(result.hmac).toBe(
      "oninak1DFnlCGR0I48dFEz4dfMwITAoEmQxgnlERrCfJfNEEvWLtrkXXvssIo9naoch07ZfFPrmX0v0edRI19Q=="
    );
  });

  it("defaults timestampIso to a wall-clock ISO string with millisecond precision", () => {
    const before = Date.now();
    const result = signDeviceSignature(FIXTURE);
    const after = Date.now();
    expect(result.timestampIso).toMatch(ISO_MS_PATTERN);
    const t = new Date(result.timestampIso).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });
});

describe("canonicalDeviceSignature", () => {
  it("matches eBay's iOS canonical form byte-for-byte", () => {
    const canonical = canonicalDeviceSignature({
      device4pp: FIXTURE.device4pp,
      idfa: FIXTURE.idfa,
      idfv: FIXTURE.idfv,
      timestampIso: "2030-01-01T00:00:00.000Z",
    });
    expect(canonical).toBe(
      '{"identifiers":[' +
        `{"key":"4pp","value":"AQADJZyhcuFFX6E2TocJor2YtqPk\\/tc5IZoUZtWyS\\/JnEC30gvQ1Xb7TLiUPmb\\/U4Qmj"},` +
        `{"key":"idfa","value":"${FIXTURE.idfa}"},` +
        `{"key":"idfv","value":"${FIXTURE.idfv}"}` +
        "]," +
        '"timestamp":"2030-01-01T00:00:00.000Z"' +
        "}"
    );
  });

  it("escapes every forward slash in device4pp values", () => {
    const canonical = canonicalDeviceSignature({
      device4pp: "a/b/c/d",
      idfa: "i",
      idfv: "v",
      timestampIso: "2030-01-01T00:00:00.000Z",
    });
    expect(canonical).toContain('"value":"a\\/b\\/c\\/d"');
  });
});
