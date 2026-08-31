import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  formatEbayPublicKey,
  parseSignatureHeader,
  verifyNotificationSignature,
} from "../verify-delivery";

describe("parseSignatureHeader", () => {
  it("decodes the base64 JSON header", () => {
    const header = Buffer.from(
      JSON.stringify({
        alg: "ecdsa",
        kid: "key-id-1",
        signature: "c2ln",
        digest: "SHA1",
      })
    ).toString("base64");
    expect(parseSignatureHeader(header)).toEqual({
      alg: "ecdsa",
      kid: "key-id-1",
      signature: "c2ln",
      digest: "SHA1",
    });
  });

  it("returns null for garbage input", () => {
    expect(parseSignatureHeader("not-base64-json")).toBeNull();
    expect(
      parseSignatureHeader(Buffer.from("{}").toString("base64"))
    ).toBeNull();
  });
});

describe("verifyNotificationSignature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  const signBody = (body: string): string => {
    // Portable spelling of the digest eBay signs with — see
    // SIGNATURE_ALGORITHM in verify-delivery.ts.
    const signer = createSign("sha1");
    signer.update(body);
    return signer.sign(privateKey).toString("base64");
  };

  const singleLinePem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString()
    .replaceAll("\n", "");

  it("verifies a valid signature against an eBay-style single-line key", () => {
    const rawBody = JSON.stringify({
      metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
      notification: { notificationId: "n1" },
    });
    expect(
      verifyNotificationSignature({
        rawBody,
        publicKeyPem: formatEbayPublicKey(singleLinePem),
        signature: signBody(rawBody),
      })
    ).toBe(true);
  });

  it("verifies when the signed form was the re-stringified message", () => {
    const compact = JSON.stringify({ a: 1, b: "two" });
    const rawWithWhitespace = '{ "a": 1, "b": "two" }';
    expect(
      verifyNotificationSignature({
        rawBody: rawWithWhitespace,
        publicKeyPem: formatEbayPublicKey(singleLinePem),
        signature: signBody(compact),
      })
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const rawBody = JSON.stringify({ orderId: "1" });
    const signature = signBody(rawBody);
    expect(
      verifyNotificationSignature({
        rawBody: JSON.stringify({ orderId: "2" }),
        publicKeyPem: formatEbayPublicKey(singleLinePem),
        signature,
      })
    ).toBe(false);
  });

  /**
   * Golden fixture signed by Node's `createSign("ssl3-sha1")` — the exact
   * spelling eBay's own SDK uses. Hard-coded because `ssl3-sha1` can't be
   * created on Bun at all, so this is the only way to prove our `sha1`
   * verification stays compatible with what eBay actually sends, on every
   * runtime the tests run under.
   */
  it("verifies a signature produced with eBay's ssl3-sha1 spelling", () => {
    const rawBody =
      '{"metadata":{"topic":"ORDER_CONFIRMATION"},"notification":{"notificationId":"golden-1"}}';
    const ssl3SignedPem =
      "-----BEGIN PUBLIC KEY-----MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE3yK32yHC3JGg1Ell8NDwhUgs+9fcOtPy787jV0ABBHfiQkhy7+kC2XpNIMOv7OoxnOgIxiDZSJqkHKXJ40DBZg==-----END PUBLIC KEY-----";
    expect(
      verifyNotificationSignature({
        rawBody,
        publicKeyPem: formatEbayPublicKey(ssl3SignedPem),
        signature:
          "MEQCIGP+aB6r2jjMXX4hliTlex8IFQUIfcdE8UJsH3Yb6IXEAiBD1TZmh6QUTIbMPSvHysuuXBpJGX77nvZ/CxY7Id0ygg==",
      })
    ).toBe(true);
  });

  it("returns false (not throws) on malformed key material", () => {
    expect(
      verifyNotificationSignature({
        rawBody: "{}",
        publicKeyPem: "not a key",
        signature: "c2ln",
      })
    ).toBe(false);
  });
});
