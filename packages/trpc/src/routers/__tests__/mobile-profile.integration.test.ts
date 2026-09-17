import { db } from "@dashseller/db";
import { claimFreeProfile } from "@dashseller/db/lib/mobile-profile-claim";
import { fencedProfileWhere } from "@dashseller/db/lib/mobile-profile-fence";
import { decryptSecret } from "@dashseller/db/lib/secret-crypto";
import { mobileProfile } from "@dashseller/db/schema";
import { migrateTestDb } from "@dashseller/db/testing";
import { eq, inArray, like, or } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "../../context";
import { createCallerFactory } from "../../index";
import { appRouter } from "../index";

/**
 * Router-level contract for the admin `mobileProfile` API against a real
 * Postgres (service DB from docker-compose.test.yml / CI). Covers the
 * boundaries the unit tests cannot: authorization, encrypted storage,
 * response redaction, mutation effects, and the worker-write fence.
 */

const KEY = "integration-test-encryption-key-0123456789";
const OTHER_KEY = "another-encryption-key-that-differs-9876543210";
/** Private `app` values for the fleet tests; cleanup matches on this prefix. */
const APP_PREFIX = "itest-app-";
/** Largest valid id; the identity sequence will never reach it in a test DB. */
const MISSING_ID = 2_147_483_647;

const ebayCredentials = {
  clientId: "eBayInc00-itest",
  device4pp: "attestation-blob",
  deviceId: "device-itest",
  guid: "guid-itest",
  hmacKey: "0f".repeat(64),
  idfa: "00000000-0000-0000-0000-00000000000a",
  idfv: "00000000-0000-0000-0000-00000000000b",
};
const shopCredentials = {
  deviceId: "3C47583A-itest",
  deviceIdHw: "8A1B2C3D-itest",
  deviceName: "Apple iPhone XR",
};

function makeSession(user: {
  role?: string | null;
  banned?: boolean | null;
}): NonNullable<Session> {
  const now = new Date();
  return {
    session: {
      id: "session-itest",
      userId: "user-itest",
      token: "token",
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
      impersonatedBy: null,
    },
    user: {
      id: "user-itest",
      name: "Integration Admin",
      email: "admin@itest.local",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role: "admin",
      banned: false,
      banReason: null,
      banExpires: null,
      twoFactorEnabled: false,
      ...user,
    },
  } as unknown as NonNullable<Session>;
}

const createCaller = createCallerFactory(appRouter);
const admin = createCaller({ session: makeSession({}), encryptionKey: KEY });
const anonymous = createCaller({ session: null, encryptionKey: KEY });
const plainUser = createCaller({
  session: makeSession({ role: "user" }),
  encryptionKey: KEY,
});
const bannedAdmin = createCaller({
  session: makeSession({ banned: true }),
  encryptionKey: KEY,
});
const multiRole = createCaller({
  session: makeSession({ role: "user,admin" }),
  encryptionKey: KEY,
});
// A role name with no entry in the access-control map grants nothing.
const unknownRole = createCaller({
  session: makeSession({ role: "ops" }),
  encryptionKey: KEY,
});

let counter = 0;

/** A hostname no real box carries, unique per call, valid for the schema. */
function hostname(): string {
  counter += 1;
  return `w-${Date.now()}-${counter}-test`;
}

/**
 * Rows created through the router carry nothing that marks them as test
 * rows (no name — the database numbers them), so every id is tracked here
 * and removed after each test.
 */
const createdIds: number[] = [];

type CreateInput = Parameters<typeof admin.mobileProfile.create>[0];
async function createProfile(input: CreateInput) {
  const row = await admin.mobileProfile.create(input);
  createdIds.push(row.id);
  return row;
}

async function rawRow(id: number) {
  const row = await db.query.mobileProfile.findFirst({
    where: eq(mobileProfile.id, id),
  });
  if (!row) {
    throw new Error(`row ${id} missing`);
  }
  return row;
}

const CIPHERTEXT_KEYS = ["credentials", "accessToken", "refreshToken"];
function expectRedacted(value: object) {
  for (const key of CIPHERTEXT_KEYS) {
    expect(value).not.toHaveProperty(key);
  }
}

beforeAll(async () => {
  await migrateTestDb();
});

afterEach(async () => {
  await db
    .delete(mobileProfile)
    .where(
      or(
        inArray(mobileProfile.id, createdIds.splice(0)),
        like(mobileProfile.app, `${APP_PREFIX}%`)
      )
    );
});

afterAll(async () => {
  await db.$client.end();
});

describe("authorization", () => {
  it("requires a session, then a role with the statement, and refuses banned users", async () => {
    await expect(anonymous.mobileProfile.getMany({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(plainUser.mobileProfile.getMany({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(bannedAdmin.mobileProfile.getMany({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      plainUser.mobileProfile.create({
        app: "shop",
        credentials: shopCredentials,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      plainUser.mobileProfile.delete({ id: MISSING_ID })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(unknownRole.mobileProfile.getMany({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(multiRole.mobileProfile.getMany({})).resolves.toMatchObject({
      items: expect.any(Array),
    });
  });
});

describe("createMany", () => {
  it("writes every entry, numbers each from the database, and reports them in input order", async () => {
    const result = await admin.mobileProfile.createMany({
      entries: [
        { app: "ebay", credentials: ebayCredentials },
        { app: "shop", credentials: shopCredentials },
      ],
    });
    createdIds.push(...result.results.map((row) => row.id));

    expect(result.created).toBe(2);
    expect(result.results.map((row) => row.position)).toEqual([0, 1]);
    const [first, second] = result.results;
    expect(first?.id).toBeGreaterThan(0);
    expect(second?.id).toBe((first?.id ?? 0) + 1);

    const listed = await admin.mobileProfile.getMany({
      filter: [
        {
          property: "id",
          condition: "inArray",
          value: [first?.id, second?.id],
        },
      ],
    });
    expect(listed.items.map((item) => item.app).sort()).toEqual([
      "ebay",
      "shop",
    ]);
    for (const item of listed.items) {
      expect(item.assignedWorker).toBeNull();
    }
  });

  it("takes the same capture twice: nothing on an entry can collide", async () => {
    const result = await admin.mobileProfile.createMany({
      entries: [
        { app: "ebay", credentials: ebayCredentials },
        { app: "ebay", credentials: ebayCredentials },
      ],
    });
    createdIds.push(...result.results.map((row) => row.id));
    expect(result.created).toBe(2);
  });

  it("refuses the whole call when one entry fails validation", async () => {
    await expect(
      admin.mobileProfile.createMany({
        entries: [
          { app: "ebay", credentials: ebayCredentials },
          {
            app: "ebay",
            credentials: { ...ebayCredentials, hmacKey: "abc" },
          },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("needs the create statement", async () => {
    await expect(
      plainUser.mobileProfile.createMany({
        entries: [{ app: "shop", credentials: shopCredentials }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("deleteMany", () => {
  it("removes every selected row and reports what it removed", async () => {
    const first = await createProfile({
      app: "ebay",
      credentials: ebayCredentials,
    });
    const second = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    const kept = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });

    const result = await admin.mobileProfile.deleteMany({
      ids: [first.id, second.id],
    });
    expect(result.count).toBe(2);
    expect(result.deleted.map((row) => row.id).sort()).toEqual(
      [first.id, second.id].sort()
    );

    await expect(
      admin.mobileProfile.get({ id: first.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      admin.mobileProfile.get({ id: kept.id })
    ).resolves.toMatchObject({ id: kept.id });
  });

  it("ignores ids that are already gone", async () => {
    const result = await admin.mobileProfile.deleteMany({
      ids: [MISSING_ID],
    });
    expect(result.count).toBe(0);
  });

  it("needs the delete statement", async () => {
    await expect(
      plainUser.mobileProfile.deleteMany({
        ids: [MISSING_ID],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("create / get / getMany", () => {
  it("stores credentials encrypted and never returns ciphertext", async () => {
    const created = await createProfile({
      app: "ebay",
      credentials: ebayCredentials,
    });
    expectRedacted(created);
    expect(created).toMatchObject({
      app: "ebay",
      status: "active",
      revision: 0,
      hasCachedBearer: false,
      hasRefreshToken: false,
    });

    const row = await rawRow(created.id);
    expect(row.credentials).not.toContain(ebayCredentials.hmacKey);
    expect(JSON.parse(await decryptSecret(row.credentials, KEY))).toEqual(
      ebayCredentials
    );

    const fetched = await admin.mobileProfile.get({ id: created.id });
    expectRedacted(fetched);
    expect(fetched.credentialsReadable).toBe(true);
    expect(fetched.identifiers).toEqual({
      clientId: ebayCredentials.clientId,
      deviceId: ebayCredentials.deviceId,
      guid: ebayCredentials.guid,
      idfa: ebayCredentials.idfa,
      idfv: ebayCredentials.idfv,
    });

    const page = await admin.mobileProfile.getMany({
      filter: [{ property: "app", condition: "eq", value: "ebay" }],
    });
    const listed = page.items.find((item) => item.id === created.id);
    expect(listed).toBeDefined();
    if (listed) {
      expectRedacted(listed);
    }
  });

  it("reports unreadable credentials instead of failing when the key differs", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    const otherKeyAdmin = createCaller({
      session: makeSession({}),
      encryptionKey: OTHER_KEY,
    });
    const fetched = await otherKeyAdmin.mobileProfile.get({ id: created.id });
    expect(fetched.credentialsReadable).toBe(false);
    expect(fetched.identifiers).toBeNull();
  });

  it("creates unassigned, with a number the database assigned", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    expect(created.assignedWorker).toBeNull();
    expect(created.id).toBeGreaterThan(0);

    const next = await createProfile({
      app: "ebay",
      credentials: ebayCredentials,
    });
    expect(next.id).toBeGreaterThan(created.id);
  });

  it("assigns and unassigns a worker hostname through update", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    const box = hostname();
    const assigned = await admin.mobileProfile.update({
      id: created.id,
      assignedWorker: box,
    });
    expect(assigned.assignedWorker).toBe(box);
    expect(assigned.revision).toBe(0);

    const unassigned = await admin.mobileProfile.update({
      id: created.id,
      assignedWorker: null,
    });
    expect(unassigned.assignedWorker).toBeNull();
  });

  it("rejects a worker value that is not a hostname", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    for (const bad of ["w-00001 orc", "box.example", "-w-00001", ""]) {
      await expect(
        admin.mobileProfile.update({ id: created.id, assignedWorker: bad })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("returns CONFLICT when two profiles of one app claim the same box", async () => {
    const box = hostname();
    const first = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await admin.mobileProfile.update({ id: first.id, assignedWorker: box });

    const second = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await expect(
      admin.mobileProfile.update({ id: second.id, assignedWorker: box })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Another app on the same box is its own persona.
    const ebay = await createProfile({
      app: "ebay",
      credentials: ebayCredentials,
    });
    const shared = await admin.mobileProfile.update({
      id: ebay.id,
      assignedWorker: box,
    });
    expect(shared.assignedWorker).toBe(box);
  });

  it("rejects an hmacKey the signer would truncate", async () => {
    await expect(
      admin.mobileProfile.create({
        app: "ebay",
        credentials: { ...ebayCredentials, hmacKey: "abc" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("mutations", () => {
  async function seedTokens(id: number) {
    await db
      .update(mobileProfile)
      .set({
        accessToken: "cached-bearer",
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshToken: "cached-refresh",
        refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
        failureCount: 2,
        failureReason: "429",
        cooldownUntil: new Date(Date.now() + 900_000),
        failedAt: new Date(),
      })
      .where(eq(mobileProfile.id, id));
  }

  it("replaceCredentials re-encrypts, drops both tokens and bumps revision", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await seedTokens(created.id);
    const before = await rawRow(created.id);

    const next = { ...shopCredentials, deviceName: "Apple iPhone 15" };
    const updated = await admin.mobileProfile.replaceCredentials({
      id: created.id,
      app: "shop",
      credentials: next,
    });
    expectRedacted(updated);
    expect(updated.revision).toBe(before.revision + 1);
    expect(updated.hasCachedBearer).toBe(false);
    expect(updated.hasRefreshToken).toBe(false);

    const row = await rawRow(created.id);
    expect(row.credentials).not.toBe(before.credentials);
    expect(JSON.parse(await decryptSecret(row.credentials, KEY))).toEqual(next);
    expect(row.accessToken).toBeNull();
    expect(row.accessTokenExpiresAt).toBeNull();
    expect(row.refreshToken).toBeNull();
    expect(row.refreshTokenExpiresAt).toBeNull();
    // Failure bookkeeping is untouched by a credential swap.
    expect(row.failureCount).toBe(2);

    await expect(
      admin.mobileProfile.replaceCredentials({
        id: created.id,
        app: "ebay",
        credentials: ebayCredentials,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("evictBearer clears only the access pair; resetFailures clears only bookkeeping", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await seedTokens(created.id);

    const evicted = await admin.mobileProfile.evictBearer({ id: created.id });
    expect(evicted.revision).toBe(1);
    let row = await rawRow(created.id);
    expect(row.accessToken).toBeNull();
    expect(row.accessTokenExpiresAt).toBeNull();
    expect(row.refreshToken).toBe("cached-refresh");
    expect(row.failureCount).toBe(2);

    const reset = await admin.mobileProfile.resetFailures({ id: created.id });
    expect(reset.revision).toBe(2);
    row = await rawRow(created.id);
    expect(row.failureCount).toBe(0);
    expect(row.failureReason).toBeNull();
    expect(row.cooldownUntil).toBeNull();
    expect(row.failedAt).toBeNull();
    expect(row.status).toBe("active");
    expect(row.refreshToken).toBe("cached-refresh");
  });

  it("update bumps revision on a status change but not on an assignment", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    const assigned = await admin.mobileProfile.update({
      id: created.id,
      assignedWorker: hostname(),
    });
    expect(assigned.revision).toBe(0);

    const dead = await admin.mobileProfile.update({
      id: created.id,
      status: "dead",
    });
    expect(dead.status).toBe("dead");
    expect(dead.revision).toBe(1);

    const same = await admin.mobileProfile.update({
      id: created.id,
      status: "dead",
    });
    expect(same.revision).toBe(1);

    await expect(
      admin.mobileProfile.update({ id: created.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("delete removes the row once and then reports NOT_FOUND", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await expect(
      admin.mobileProfile.delete({ id: created.id })
    ).resolves.toEqual({ id: created.id });
    await expect(
      admin.mobileProfile.delete({ id: created.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      admin.mobileProfile.get({ id: created.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("worker fence", () => {
  it("a worker write carrying the pre-mutation revision matches no row", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await seedTokensFor(created.id);
    const loadedByWorker = await rawRow(created.id);

    await admin.mobileProfile.replaceCredentials({
      id: created.id,
      app: "shop",
      credentials: shopCredentials,
    });

    // Exactly the statement MobileProfileTokenManager.writeFenced runs.
    const staleWrite = await db
      .update(mobileProfile)
      .set({ accessToken: "stale-bearer-from-old-run" })
      .where(fencedProfileWhere(created.id, loadedByWorker.revision))
      .returning({ id: mobileProfile.id });
    expect(staleWrite).toEqual([]);

    const row = await rawRow(created.id);
    expect(row.accessToken).toBeNull();

    // A worker that reloaded the row writes through.
    const freshWrite = await db
      .update(mobileProfile)
      .set({ lastUsedAt: new Date() })
      .where(fencedProfileWhere(created.id, row.revision))
      .returning({ id: mobileProfile.id });
    expect(freshWrite).toHaveLength(1);
  });

  it("evictBearer and resetFailures fence out a stale run too", async () => {
    for (const action of ["evictBearer", "resetFailures"] as const) {
      const created = await createProfile({
        app: "shop",
        credentials: shopCredentials,
      });
      const loaded = await rawRow(created.id);
      await admin.mobileProfile[action]({ id: created.id });
      const stale = await db
        .update(mobileProfile)
        .set({ failureCount: 99 })
        .where(fencedProfileWhere(created.id, loaded.revision))
        .returning({ id: mobileProfile.id });
      expect(stale).toEqual([]);
      expect((await rawRow(created.id)).failureCount).toBe(0);
    }
  });
});

describe("worker claim", () => {
  /**
   * `claimFreeProfile` is the statement `loadForThisBox` runs when a box owns
   * no row. Rows here are created through the router (real apps) so the
   * unique index and the identity numbering are the production ones; the
   * hostnames never match a real box.
   */
  it("takes the lowest-numbered free active profile for the app, once", async () => {
    const box = hostname();
    const [first, second] = [
      await createProfile({ app: "shop", credentials: shopCredentials }),
      await createProfile({ app: "shop", credentials: shopCredentials }),
    ];
    const otherApp = await createProfile({
      app: "ebay",
      credentials: ebayCredentials,
    });

    const claimed = await claimFreeProfile(db, "shop", box);
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.assignedWorker).toBe(box);

    // Already owns a row for the app: no second claim, even with one free.
    expect(await claimFreeProfile(db, "shop", box)).toBeNull();
    expect((await rawRow(second.id)).assignedWorker).toBeNull();

    // Another app is a separate persona for the same box.
    const ebay = await claimFreeProfile(db, "ebay", box);
    expect(ebay?.id).toBe(otherApp.id);

    // The next box gets the next free row.
    const next = await claimFreeProfile(db, "shop", hostname());
    expect(next?.id).toBe(second.id);
  });

  it("skips dead, cooling-down and already-assigned rows; null when nothing is free", async () => {
    const dead = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await admin.mobileProfile.update({ id: dead.id, status: "dead" });
    const cooling = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await db
      .update(mobileProfile)
      .set({ cooldownUntil: new Date(Date.now() + 900_000) })
      .where(eq(mobileProfile.id, cooling.id));
    const taken = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    await admin.mobileProfile.update({
      id: taken.id,
      assignedWorker: hostname(),
    });

    expect(await claimFreeProfile(db, "shop", hostname())).toBeNull();
    for (const row of [dead, cooling]) {
      expect((await rawRow(row.id)).assignedWorker).toBeNull();
    }
  });

  it("does not bump revision: nothing had loaded the row yet", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    const claimed = await claimFreeProfile(db, "shop", hostname());
    expect(claimed?.id).toBe(created.id);
    expect(claimed?.revision).toBe(0);
  });

  it("settles concurrent claims from different boxes without sharing a row", async () => {
    const created = await createProfile({
      app: "shop",
      credentials: shopCredentials,
    });
    const boxes = [hostname(), hostname(), hostname()];
    const results = await Promise.all(
      boxes.map((box) => claimFreeProfile(db, "shop", box))
    );
    const winners = results.filter((row) => row !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.id).toBe(created.id);
  });
});

async function seedTokensFor(id: number) {
  await db
    .update(mobileProfile)
    .set({
      accessToken: "cached-bearer",
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    })
    .where(eq(mobileProfile.id, id));
}

describe("token fleet view", () => {
  /**
   * Rows for the token views are seeded straight into the table: `create`
   * only accepts the two real apps, and these tests need a private `app`
   * value so the fleet-wide evict cannot touch anything else in the database.
   */
  async function seedProfile(
    app: string,
    tokens: { accessToken: string | null; accessTokenExpiresAt: Date | null }
  ) {
    const rows = await db
      .insert(mobileProfile)
      .values({
        app,
        credentials: "opaque-ciphertext",
        failureCount: 3,
        failureReason: "429",
        cooldownUntil: new Date(Date.now() + 900_000),
        failedAt: new Date(),
        ...tokens,
      })
      .returning({ id: mobileProfile.id });
    const row = rows[0];
    if (!row) {
      throw new Error("seed failed");
    }
    return row.id;
  }

  function minutes(n: number) {
    return new Date(Date.now() + n * 60_000);
  }

  async function seedStates(app: string) {
    return {
      valid: await seedProfile(app, {
        accessToken: "bearer",
        accessTokenExpiresAt: minutes(42),
      }),
      expiring: await seedProfile(app, {
        accessToken: "bearer",
        accessTokenExpiresAt: minutes(9),
      }),
      expired: await seedProfile(app, {
        accessToken: "bearer",
        accessTokenExpiresAt: minutes(-26),
      }),
      none: await seedProfile(app, {
        accessToken: null,
        accessTokenExpiresAt: null,
      }),
    };
  }

  async function idsForState(app: string, state: string) {
    const page = await admin.mobileProfile.getMany({
      filter: [
        { property: "app", condition: "eq", value: app },
        { property: "bearerState", condition: "eq", value: state },
      ],
      limit: 100,
    });
    return page.items.map((item) => item.id);
  }

  it("derives bearerState on the row and filters by it in SQL", async () => {
    const app = `${APP_PREFIX}${counter}-states`;
    const seeded = await seedStates(app);

    expect(await idsForState(app, "valid")).toEqual([seeded.valid]);
    expect(await idsForState(app, "expiring")).toEqual([seeded.expiring]);
    expect(await idsForState(app, "expired")).toEqual([seeded.expired]);
    expect(await idsForState(app, "none")).toEqual([seeded.none]);

    const detail = await admin.mobileProfile.get({ id: seeded.expired });
    expect(detail.bearerState).toBe("expired");

    const page = await admin.mobileProfile.getMany({
      filter: [
        { property: "app", condition: "eq", value: app },
        {
          property: "bearerState",
          condition: "inArray",
          value: ["expired", "none"],
        },
      ],
      limit: 100,
    });
    expect(page.items.map((item) => item.id).sort()).toEqual(
      [seeded.expired, seeded.none].sort()
    );
  });

  it("evictBearerMany clears only the listed rows and bumps their revision", async () => {
    const app = `${APP_PREFIX}${counter}-evict`;
    const seeded = await seedStates(app);
    const before = await rawRow(seeded.valid);

    const result = await admin.mobileProfile.evictBearerMany({
      ids: [seeded.valid, seeded.expired],
    });
    expect(result.count).toBe(2);

    const cleared = await rawRow(seeded.valid);
    expect(cleared.accessToken).toBeNull();
    expect(cleared.accessTokenExpiresAt).toBeNull();
    expect(cleared.revision).toBe(before.revision + 1);

    const untouched = await rawRow(seeded.expiring);
    expect(untouched.accessToken).not.toBeNull();
  });

  it("resetFailuresMany clears backoff bookkeeping and bumps revision", async () => {
    const app = `${APP_PREFIX}${counter}-reset`;
    const seeded = await seedStates(app);
    const before = await rawRow(seeded.none);

    const result = await admin.mobileProfile.resetFailuresMany({
      ids: [seeded.none],
    });
    expect(result.count).toBe(1);

    const row = await rawRow(seeded.none);
    expect(row.failureCount).toBe(0);
    expect(row.cooldownUntil).toBeNull();
    expect(row.failureReason).toBeNull();
    expect(row.failedAt).toBeNull();
    expect(row.revision).toBe(before.revision + 1);
  });

  it("evictExpiredBearers evicts expired bearers in the given app only", async () => {
    const app = `${APP_PREFIX}${counter}-expired`;
    const other = `${app}-other`;
    const seeded = await seedStates(app);
    const otherExpired = await seedProfile(other, {
      accessToken: "bearer",
      accessTokenExpiresAt: minutes(-5),
    });

    const result = await admin.mobileProfile.evictExpiredBearers({ app });
    expect(result.count).toBe(1);

    expect((await rawRow(seeded.expired)).accessToken).toBeNull();
    expect((await rawRow(seeded.valid)).accessToken).not.toBeNull();
    expect((await rawRow(otherExpired)).accessToken).not.toBeNull();
  });
});
