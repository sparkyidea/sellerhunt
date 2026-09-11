/** Database ownership primitives shared by the scan manager and persona seed. */
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  mobileProfile,
  type SelectMobileProfile,
} from "./schema/mobile-profile";

export type ProfileTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export const BOX_PERSONA_DEATHS_PER_DAY = 3;
const DEATH_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function lockMobileProfileOwner(
  tx: ProfileTransaction,
  app: string,
  label: string | null
): Promise<void> {
  if (label === null) {
    return;
  }
  await lockIdentity(tx, ["mobile-profile-owner", app, label]);
}

async function lockIdentity(
  tx: ProfileTransaction,
  identity: readonly string[]
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(identity)}, 0))`
  );
}

type Acquisition =
  | { profile: SelectMobileProfile; claimed: boolean }
  | { reason: "cooling"; until: Date }
  | { reason: "pool-empty" | "box-burned" };

export async function acquireMobileProfile(
  database: Database,
  app: string,
  label: string
): Promise<Acquisition> {
  return await database.transaction(async (tx) => {
    await lockMobileProfileOwner(tx, app, label);
    const now = new Date();
    const [owned] = await tx
      .select()
      .from(mobileProfile)
      .where(
        and(
          eq(mobileProfile.app, app),
          eq(mobileProfile.label, label),
          eq(mobileProfile.status, "active")
        )
      )
      .limit(1)
      .for("update");
    if (owned) {
      if (owned.cooldownUntil && owned.cooldownUntil > now) {
        return { reason: "cooling", until: owned.cooldownUntil };
      }
      return { profile: owned, claimed: false };
    }
    const deaths = await tx
      .select({ id: mobileProfile.id })
      .from(mobileProfile)
      .where(
        and(
          eq(mobileProfile.app, app),
          eq(mobileProfile.label, label),
          eq(mobileProfile.status, "dead"),
          gt(mobileProfile.failedAt, new Date(now.getTime() - DEATH_WINDOW_MS))
        )
      )
      .limit(BOX_PERSONA_DEATHS_PER_DAY);
    if (deaths.length >= BOX_PERSONA_DEATHS_PER_DAY) {
      return { reason: "box-burned" };
    }
    const [candidate] = await tx
      .select()
      .from(mobileProfile)
      .where(
        and(
          eq(mobileProfile.app, app),
          isNull(mobileProfile.label),
          eq(mobileProfile.status, "active"),
          or(
            isNull(mobileProfile.cooldownUntil),
            lte(mobileProfile.cooldownUntil, now)
          )
        )
      )
      .orderBy(asc(mobileProfile.createdAt), asc(mobileProfile.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) {
      return { reason: "pool-empty" };
    }
    const [profile] = await tx
      .update(mobileProfile)
      .set({ label, claimedAt: now })
      .where(eq(mobileProfile.id, candidate.id))
      .returning();
    if (!profile) {
      throw new Error("Persona claim returned no row");
    }
    return { profile, claimed: true };
  });
}

interface ProfileSeedInput {
  app: string;
  capture: string;
  credentials: string;
}
type SeedResult = "inserted" | "updated" | "ownership-conflict";

/** Do not revive a historical owner over a box's already-active replacement. */
export async function seedMobileProfile(
  database: Database,
  input: ProfileSeedInput
): Promise<SeedResult> {
  // An unclaimed persona can acquire a label between the seed's read and row lock.
  // Restart to take the box lock BEFORE the row lock, avoiding an inverted lock order.
  for (;;) {
    const result = await database.transaction(async (tx) => {
      await lockIdentity(tx, [
        "mobile-profile-capture",
        input.app,
        input.capture,
      ]);
      const matches = await tx
        .select()
        .from(mobileProfile)
        .where(
          and(
            eq(mobileProfile.app, input.app),
            eq(mobileProfile.capture, input.capture)
          )
        )
        .limit(2);
      if (matches.length > 1) {
        throw new Error(
          `Ambiguous persona capture: ${input.app}/${input.capture}`
        );
      }
      const existing = matches[0];
      if (!existing) {
        await tx.insert(mobileProfile).values({ ...input, label: null });
        return "inserted" as const;
      }
      await lockMobileProfileOwner(tx, input.app, existing.label);
      const [current] = await tx
        .select()
        .from(mobileProfile)
        .where(eq(mobileProfile.id, existing.id))
        .limit(1)
        .for("update");
      if (!current || current.label !== existing.label) {
        return "retry" as const;
      }
      if (current.label !== null) {
        const [owner] = await tx
          .select({ id: mobileProfile.id })
          .from(mobileProfile)
          .where(
            and(
              eq(mobileProfile.app, input.app),
              eq(mobileProfile.label, current.label),
              eq(mobileProfile.status, "active")
            )
          )
          .limit(1);
        if (owner && owner.id !== current.id) {
          return "ownership-conflict" as const;
        }
      }
      await tx
        .update(mobileProfile)
        .set({
          credentials: input.credentials,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshToken: null,
          refreshTokenExpiresAt: null,
          status: "active",
          failureCount: 0,
          cooldownUntil: null,
          failureReason: null,
          failedAt: null,
        })
        .where(eq(mobileProfile.id, current.id));
      return "updated" as const;
    });
    if (result !== "retry") {
      return result;
    }
  }
}
