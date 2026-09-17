import { describe, expect, it } from "bun:test";
import {
  credentialsInputSchema,
  ebayHmacCredentialsSchema,
  pickPublicIdentifiers,
  shopRefreshTokenCredentialsSchema,
} from "../mobile-credentials";

const ebay = {
  clientId: "eBayInc00-0000-0000-0000-000000000000",
  device4pp: "attestation",
  deviceId: "19de84291b7",
  guid: "guid-1",
  hmacKey: "0f".repeat(64),
  idfa: "00000000-0000-0000-0000-000000000000",
  idfv: "00000000-0000-0000-0000-000000000001",
};
const shop = {
  deviceId: "3C47583A-0000-0000-0000-000000000000",
  deviceIdHw: "8A1B2C3D-0000-0000-0000-000000000000",
  deviceName: "Apple iPhone XR",
};

describe("ebayHmacCredentialsSchema", () => {
  it("accepts a full capture and trims whitespace", () => {
    const parsed = ebayHmacCredentialsSchema.parse({
      ...ebay,
      clientId: `  ${ebay.clientId}  `,
    });
    expect(parsed.clientId).toBe(ebay.clientId);
  });
  it("rejects a missing field and an unexpected field", () => {
    const { hmacKey: _omitted, ...missing } = ebay;
    expect(ebayHmacCredentialsSchema.safeParse(missing).success).toBe(false);
    expect(
      ebayHmacCredentialsSchema.safeParse({ ...ebay, extra: "x" }).success
    ).toBe(false);
  });
  it("rejects hmacKey values the hex signer would silently truncate", () => {
    for (const hmacKey of ["not-hex", "abc", "", "0f 0f", "zz"]) {
      expect(
        ebayHmacCredentialsSchema.safeParse({ ...ebay, hmacKey }).success
      ).toBe(false);
    }
    expect(
      ebayHmacCredentialsSchema.safeParse({ ...ebay, hmacKey: "ABCDEF01" })
        .success
    ).toBe(true);
  });
});

describe("shopRefreshTokenCredentialsSchema", () => {
  it("accepts the three device headers and nothing else", () => {
    expect(shopRefreshTokenCredentialsSchema.safeParse(shop).success).toBe(
      true
    );
    expect(
      shopRefreshTokenCredentialsSchema.safeParse({ ...shop, hmacKey: "00" })
        .success
    ).toBe(false);
  });
});

describe("credentialsInputSchema", () => {
  it("narrows the credential shape by app", () => {
    expect(
      credentialsInputSchema.safeParse({ app: "ebay", credentials: ebay })
        .success
    ).toBe(true);
    expect(
      credentialsInputSchema.safeParse({ app: "ebay", credentials: shop })
        .success
    ).toBe(false);
    expect(
      credentialsInputSchema.safeParse({ app: "other", credentials: shop })
        .success
    ).toBe(false);
  });
});

describe("pickPublicIdentifiers", () => {
  it("returns only the allowlisted eBay identifiers", () => {
    expect(pickPublicIdentifiers("ebay", { ...ebay, extra: "leak" })).toEqual({
      clientId: ebay.clientId,
      deviceId: ebay.deviceId,
      guid: ebay.guid,
      idfa: ebay.idfa,
      idfv: ebay.idfv,
    });
  });
  it("returns the shop device headers", () => {
    expect(pickPublicIdentifiers("shop", shop)).toEqual(shop);
  });
  it("skips non-string values and returns null for unknown apps or blobs", () => {
    expect(pickPublicIdentifiers("shop", { ...shop, deviceName: 7 })).toEqual({
      deviceId: shop.deviceId,
      deviceIdHw: shop.deviceIdHw,
    });
    expect(pickPublicIdentifiers("other", shop)).toBeNull();
    expect(pickPublicIdentifiers("ebay", null)).toBeNull();
    expect(pickPublicIdentifiers("ebay", ["a"])).toBeNull();
  });
});
