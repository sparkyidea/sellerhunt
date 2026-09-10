import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createDbClient } from "../client";
import {
  acquireMobileProfile,
  lockMobileProfileOwner,
  seedMobileProfile,
} from "../mobile-profile-ownership";
import { mobileProfile } from "../schema/mobile-profile";
import { migrateTestDb, TEST_DATABASE_URL } from "../testing";

// Separate pools guarantee independent sessions during overlapping transactions.
const first = createDbClient(TEST_DATABASE_URL);
const second = createDbClient(TEST_DATABASE_URL);
beforeAll(() => migrateTestDb());
beforeEach(async () => {
  await first.db.delete(mobileProfile);
});
afterAll(async () => {
  await Promise.all([first.close(), second.close()]);
});
async function seed(
  id: string,
  fields: Partial<typeof mobileProfile.$inferInsert> = {}
) {
  await first.db.insert(mobileProfile).values({
    id,
    app: "ebay",
    capture: id,
    credentials: "encrypted",
    ...fields,
  });
}
async function owners() {
  return await first.db
    .select()
    .from(mobileProfile)
    .where(
      and(eq(mobileProfile.status, "active"), eq(mobileProfile.label, "box"))
    );
}
function gate() {
  let release: () => void = () => {
    throw new Error("Gate not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it("serializes simultaneous acquisition for the same box", async () => {
  await seed("a");
  await seed("b");
  const [left, right] = await Promise.all([
    acquireMobileProfile(first.db, "ebay", "box"),
    acquireMobileProfile(second.db, "ebay", "box"),
  ]);
  expect(left).toMatchObject({ profile: { id: "a", label: "box" } });
  expect(right).toMatchObject({ profile: { id: "a", label: "box" } });
  expect(
    [left, right].filter((result) => "claimed" in result && result.claimed)
  ).toHaveLength(1);
  expect(await owners()).toHaveLength(1);
});
it("lets different boxes compete for a single unowned persona", async () => {
  await seed("only");
  const results = await Promise.all([
    acquireMobileProfile(first.db, "ebay", "box"),
    acquireMobileProfile(second.db, "ebay", "other"),
  ]);
  expect(results.filter((result) => "profile" in result)).toHaveLength(1);
  expect(results.filter((result) => "reason" in result)).toEqual([
    { reason: "pool-empty" },
  ]);
});
it("retains a cooling owner instead of claiming a second persona", async () => {
  const until = new Date(Date.now() + 60_000);
  await seed("owner", { label: "box", cooldownUntil: until });
  await seed("free");
  const results = await Promise.all([
    acquireMobileProfile(first.db, "ebay", "box"),
    acquireMobileProfile(second.db, "ebay", "box"),
  ]);
  expect(results).toEqual([
    { reason: "cooling", until },
    { reason: "cooling", until },
  ]);
  expect(await owners()).toHaveLength(1);
});
it("enforces the partial constraint even when callers bypass the acquisition helper", async () => {
  await seed("owned", {
    label: "box",
    cooldownUntil: new Date(Date.now() + 60_000),
  });
  await expect(
    second.db
      .insert(mobileProfile)
      .values({ app: "ebay", label: "box", credentials: "encrypted" })
  ).rejects.toMatchObject({
    cause: {
      code: "23505",
      constraint: "mobile_profile_one_active_owner_per_box",
    },
  });
  await seed("dead", { label: "box", status: "dead" });
  await seed("shop", { app: "shop", label: "box" });
  await seed("free-a");
  await seed("free-b");
  expect(await owners()).toHaveLength(2);
});
it("blocks a box after three recent deaths without burning the free pool", async () => {
  for (const id of ["dead-a", "dead-b", "dead-c"]) {
    await seed(id, { label: "box", status: "dead", failedAt: new Date() });
  }
  await seed("free");
  expect(await acquireMobileProfile(first.db, "ebay", "box")).toEqual({
    reason: "box-burned",
  });
  expect(await acquireMobileProfile(second.db, "shop", "box")).toEqual({
    reason: "pool-empty",
  });
});
it("reuses an active owner even when its box has three recent historical deaths", async () => {
  for (const id of ["dead-a", "dead-b", "dead-c"]) {
    await seed(id, { label: "box", status: "dead", failedAt: new Date() });
  }
  await seed("active", { label: "box" });
  expect(await acquireMobileProfile(first.db, "ebay", "box")).toMatchObject({
    profile: { id: "active" },
    claimed: false,
  });
});
it("does not count old deaths toward the daily guard", async () => {
  for (const id of ["a", "b", "c"]) {
    await seed(id, {
      label: "box",
      status: "dead",
      failedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
  }
  await seed("free");
  expect(await acquireMobileProfile(first.db, "ebay", "box")).toMatchObject({
    profile: { id: "free" },
  });
});
it("preserves a dead capture when replacement acquisition races its reseed", async () => {
  const failedAt = new Date();
  await seed("old", {
    label: "box",
    status: "dead",
    failedAt,
    failureCount: 3,
    failureReason: "burned",
  });
  await seed("replacement");
  const holding = gate();
  const release = gate();
  const replacement = first.db.transaction(async (tx) => {
    await lockMobileProfileOwner(tx, "ebay", "box");
    holding.release();
    await release.promise;
    await tx
      .update(mobileProfile)
      .set({ label: "box", claimedAt: new Date() })
      .where(eq(mobileProfile.id, "replacement"));
  });
  await holding.promise;
  const reseed = seedMobileProfile(second.db, {
    app: "ebay",
    capture: "old",
    credentials: "new",
  });
  release.release();
  await replacement;
  expect(await reseed).toBe("ownership-conflict");
  const [old] = await first.db
    .select()
    .from(mobileProfile)
    .where(eq(mobileProfile.id, "old"));
  expect(old).toMatchObject({
    status: "dead",
    label: "box",
    failedAt,
    failureCount: 3,
    failureReason: "burned",
    credentials: "encrypted",
  });
  expect(await owners()).toEqual([
    expect.objectContaining({ id: "replacement" }),
  ]);
});
it("serializes the opposite seed-versus-replacement ordering without two owners", async () => {
  await seed("old", { label: "box", status: "dead", failedAt: new Date() });
  await seed("free");
  const results = await Promise.all([
    seedMobileProfile(first.db, {
      app: "ebay",
      capture: "old",
      credentials: "new",
    }),
    acquireMobileProfile(second.db, "ebay", "box"),
  ]);
  const active = await owners();
  expect(active).toHaveLength(1);
  if (results[0] === "updated") {
    expect(active[0]?.id).toBe("old");
  } else {
    expect(results[0]).toBe("ownership-conflict");
  }
});
it("keeps new captures unclaimed and makes concurrent seed insertion idempotent", async () => {
  const input = { app: "ebay", capture: "new", credentials: "encrypted" };
  const results = await Promise.all([
    seedMobileProfile(first.db, input),
    seedMobileProfile(second.db, input),
  ]);
  expect(results.sort()).toEqual(["inserted", "updated"]);
  const rows = await first.db.select().from(mobileProfile);
  expect(rows).toEqual([
    expect.objectContaining({ capture: "new", label: null, claimedAt: null }),
  ]);
});
it("releases the transaction lock after rollback", async () => {
  await seed("free");
  await expect(
    first.db.transaction(async (tx) => {
      await lockMobileProfileOwner(tx, "ebay", "box");
      await tx.execute(sql`select 1 / 0`);
    })
  ).rejects.toThrow();
  expect(await acquireMobileProfile(second.db, "ebay", "box")).toMatchObject({
    profile: { id: "free" },
  });
});
