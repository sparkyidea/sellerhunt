import { encryptSecret } from "@dashseller/db/lib/secret-crypto";
import type { SelectMobileProfile } from "@dashseller/db/schema";
import { beforeEach, expect, it, vi } from "vitest";
import { MobileProfileTokenManager } from "../mobile-profile-manager";
import { StaleMobileProfileError } from "../scan-errors";

const ENCRYPTION_SECRET = "0123456789abcdef0123456789abcdef";

const mocks = vi.hoisted(() => ({
  returning: vi.fn(),
  set: vi.fn(),
  fencedProfileWhere: vi.fn(() => "fenced-where"),
  getScanToken: vi.fn(),
}));

vi.mock("@dashseller/db/trigger", () => {
  const chain = {
    set: (values: unknown) => {
      mocks.set(values);
      return chain;
    },
    where: () => chain,
    returning: () => mocks.returning(),
  };
  return { db: { update: () => chain } };
});
vi.mock("@dashseller/db/lib/mobile-profile-fence", () => ({
  fencedProfileWhere: mocks.fencedProfileWhere,
}));
vi.mock("@dashseller/env/trigger-scan", () => ({
  env: {
    DATABASE_URL: "postgres://unused",
    ENCRYPTION_SECRET: "0123456789abcdef0123456789abcdef",
  },
}));
vi.mock("@trigger.dev/sdk", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@dashseller/marketplace-scan", () => ({
  createScanClient: vi.fn(),
  getScanToken: mocks.getScanToken,
}));

function profile(
  overrides: Partial<SelectMobileProfile> = {}
): SelectMobileProfile {
  return {
    id: 1,
    app: "ebay",
    assignedWorker: "w-00001-orc-e2cpu1ram1-sparkyideainc",
    credentials: "ciphertext",
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshToken: null,
    refreshTokenExpiresAt: null,
    status: "active",
    lastUsedAt: null,
    lastSuccessAt: null,
    failedAt: null,
    failureReason: null,
    failureCount: 0,
    cooldownUntil: null,
    revision: 3,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.returning.mockReset();
  mocks.set.mockReset();
  mocks.fencedProfileWhere.mockClear();
  mocks.getScanToken.mockReset();
});

it("fences every write on the revision loaded with the row", async () => {
  mocks.returning.mockResolvedValue([{ id: 1 }]);
  const manager = new MobileProfileTokenManager(profile({ revision: 7 }));
  await manager.markUsed();
  await manager.markDataAuthFailure("401");
  await manager.markDead("mint rejected");
  expect(mocks.fencedProfileWhere).toHaveBeenCalledTimes(3);
  for (const call of mocks.fencedProfileWhere.mock.calls) {
    expect(call).toEqual([1, 7]);
  }
});

it("keeps in-memory state in sync so consecutive soft failures count up", async () => {
  mocks.returning.mockResolvedValue([{ id: 1 }]);
  const manager = new MobileProfileTokenManager(profile());
  await manager.markSoftFailure("429");
  await manager.markSoftFailure("429");
  expect(mocks.set.mock.calls.map(([values]) => values.failureCount)).toEqual([
    1, 2,
  ]);
  // Third consecutive failure promotes to dead (default threshold 3).
  await manager.markSoftFailure("429");
  expect(mocks.set.mock.calls[2]?.[0]).toMatchObject({
    failureCount: 3,
    status: "dead",
  });
});

it("throws StaleMobileProfileError when the fenced write matches no row and leaves memory untouched", async () => {
  const manager = new MobileProfileTokenManager(profile());
  mocks.returning.mockResolvedValueOnce([]);
  await expect(manager.markSoftFailure("429")).rejects.toBeInstanceOf(
    StaleMobileProfileError
  );
  // The rejected write did not advance the in-memory counter.
  mocks.returning.mockResolvedValueOnce([{ id: 1 }]);
  await manager.markSoftFailure("429");
  expect(mocks.set.mock.calls.at(-1)?.[0]).toMatchObject({ failureCount: 1 });
});

it("refuses to persist a freshly minted bearer once an admin changed the row", async () => {
  const credentials = await encryptSecret(
    JSON.stringify({
      clientId: "c",
      device4pp: "d",
      deviceId: "id",
      guid: "g",
      hmacKey: "ab",
      idfa: "i",
      idfv: "v",
    }),
    ENCRYPTION_SECRET
  );
  const manager = new MobileProfileTokenManager(profile({ credentials }));
  mocks.getScanToken.mockResolvedValue({
    accessToken: "minted",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  mocks.returning.mockResolvedValueOnce([]);
  await expect(manager.getValidAccessToken()).rejects.toBeInstanceOf(
    StaleMobileProfileError
  );
  expect(mocks.set).toHaveBeenCalledTimes(1);
  expect(mocks.set.mock.calls[0]?.[0]).toMatchObject({
    accessTokenExpiresAt: expect.any(Date),
  });
  expect(mocks.set.mock.calls[0]?.[0].accessToken).not.toBe("minted");
});
