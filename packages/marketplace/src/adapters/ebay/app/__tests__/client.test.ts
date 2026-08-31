import { describe, expect, it } from "vitest";
import { EbayAppClient } from "../client";

// `answerChallenge` is pure — no network, no app token — so the client can be
// constructed with throwaway credentials.
const client = new EbayAppClient({ clientId: "id", clientSecret: "secret" });

describe("EbayAppClient.answerChallenge", () => {
  it("hashes challengeCode + verificationToken + endpoint as sha256 hex", () => {
    // Independent vector: echo -n 'abc123tok_0123456789_0123456789_0123456789https://api.example.com/webhook/ebay' | shasum -a 256
    const result = client.answerChallenge({
      challengeCode: "abc123",
      verificationToken: "tok_0123456789_0123456789_0123456789",
      endpoint: "https://api.example.com/webhook/ebay",
    });
    expect(result).toEqual({
      challengeResponse:
        "5f340f7fba4d1c70daa212b4cf75cd9163eeceb97e60195984a1703d6c62515b",
    });
  });

  it("is sensitive to the exact endpoint string", () => {
    const base = {
      challengeCode: "abc123",
      verificationToken: "tok_0123456789_0123456789_0123456789",
    };
    const withSlash = client.answerChallenge({
      ...base,
      endpoint: "https://api.example.com/webhook/ebay/",
    });
    const withoutSlash = client.answerChallenge({
      ...base,
      endpoint: "https://api.example.com/webhook/ebay",
    });
    expect(withSlash.challengeResponse).not.toBe(
      withoutSlash.challengeResponse
    );
  });
});
