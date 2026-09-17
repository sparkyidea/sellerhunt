import { encryptSecret } from "@dashseller/db/lib/secret-crypto";
import type { SelectMobileProfile } from "@dashseller/db/schema";
import { beforeEach, expect, it, vi } from "vitest";
import { MobileProfileTokenManager } from "../mobile-profile-manager";
import { PersonaScanError, StaleMobileProfileError } from "../scan-errors";

const ENCRYPTION_SECRET = "0123456789abcdef0123456789abcdef";

const mocks = vi.hoisted(() => ({
  returning: vi.fn(),
  set: vi.fn(),
  getScanToken: vi.fn(),
  /** Rows a `db.select()…limit()` resolves to, one call at a time. */
  rows: vi.fn(),
  getBoxName: vi.fn(),
  claimFreeProfile: vi.fn(),
}));

vi.mock("../db", () => {
  const chain = {
    set: (values: unknown) => {
      mocks.set(values);
      return chain;
    },
    where: () => chain,
    returning: () => mocks.returning(),
  };
  const select = {
    from: () => select,
    where: () => select,
    limit: () => mocks.rows(),
  };
  return { db: { update: () => chain, select: () => select } };
});
vi.mock("../box-name", () => ({ getBoxName: mocks.getBoxName }));
vi.mock("@dashseller/db/lib/mobile-profile-claim", () => ({
  claimFreeProfile: mocks.claimFreeProfile,
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
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.returning.mockReset();
  mocks.set.mockReset();
  mocks.getScanToken.mockReset();
  mocks.rows.mockReset();
  mocks.getBoxName.mockReset();
  mocks.claimFreeProfile.mockReset();
});

/** loadForWorker (miss), claim (nothing free), loadForWorker again (miss), then the diagnosis row. */
function nothingLoadable(owned: Partial<SelectMobileProfile> | null) {
  mocks.getBoxName.mockResolvedValue("w-00001-orc-e2cpu1ram1-sparkyideainc");
  mocks.claimFreeProfile.mockResolvedValue(null);
  mocks.rows
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(owned ? [owned] : []);
}

it("retries after the persona delay when the box's profile is in cooldown", async () => {
  nothingLoadable({
    id: 7,
    status: "active",
    cooldownUntil: new Date(Date.now() + 10 * 60_000),
  });
  const error = await MobileProfileTokenManager.loadForThisBox("ebay").catch(
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(PersonaScanError);
  expect((error as PersonaScanError).authFailure).toBe(false);
  expect((error as Error).message).toContain("profile 7");
  expect((error as Error).message).toContain("cooldown");
});

it("fails plainly when the box's profile is dead or it has none and nothing is free", async () => {
  nothingLoadable({ id: 7, status: "dead", cooldownUntil: null });
  const dead = await MobileProfileTokenManager.loadForThisBox("ebay").catch(
    (e: unknown) => e
  );
  expect(dead).not.toBeInstanceOf(PersonaScanError);
  expect((dead as Error).message).toContain("profile 7 is dead");

  nothingLoadable(null);
  const none = await MobileProfileTokenManager.loadForThisBox("ebay").catch(
    (e: unknown) => e
  );
  expect(none).not.toBeInstanceOf(PersonaScanError);
  expect((none as Error).message).toContain("no unassigned active profile");
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

it("throws StaleMobileProfileError when the row is gone and leaves memory untouched", async () => {
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

it("refuses to persist a freshly minted bearer once the row is gone", async () => {
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
