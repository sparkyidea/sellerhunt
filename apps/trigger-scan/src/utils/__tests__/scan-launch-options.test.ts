import { idempotencyKeys } from "@trigger.dev/sdk";
import { describe, expect, it, vi } from "vitest";
import { scanLaunchOptions } from "../scan-launch-options";

describe("scan launch keys", () => {
  it("gives cron ticks and keyword promotion the same explicitly global seller key", async () => {
    const createKey = vi.fn(idempotencyKeys.create);
    const firstTick = await scanLaunchOptions(
      "seller",
      "ebay",
      "seller-1",
      createKey
    );
    const nextTick = await scanLaunchOptions(
      "seller",
      "ebay",
      "seller-1",
      createKey
    );
    const promotion = await scanLaunchOptions(
      "seller",
      "ebay",
      "seller-1",
      createKey
    );
    expect(nextTick).toEqual(firstTick);
    expect(promotion).toEqual(firstTick);
    expect(createKey).toHaveBeenCalledTimes(3);
    expect(createKey).toHaveBeenCalledWith(
      JSON.stringify(["seller", "ebay", "seller-1"]),
      { scope: "global" }
    );
    expect(firstTick.idempotencyKeyTTL).toBe("2h");
  });

  it("reuses keyword keys across bulk launches with the same fixed TTL", async () => {
    const first = await scanLaunchOptions("keyword", "ebay", "camera");
    expect(await scanLaunchOptions("keyword", "ebay", "camera")).toEqual(first);
    expect(first.idempotencyKeyTTL).toBe("2h");
  });

  it("separates entity types, marketplaces, references, and delimiter-shaped values", async () => {
    const identities = [
      ["seller", "ebay", "a"],
      ["keyword", "ebay", "a"],
      ["seller", "shop", "a"],
      ["seller", "ebay", "b"],
      ["seller", "a_b", "c"],
      ["seller", "a", "b_c"],
    ] as const;
    const keys = new Set<string>();
    for (const [entity, marketplace, reference] of identities) {
      const options = await scanLaunchOptions(entity, marketplace, reference);
      keys.add(String(options.idempotencyKey));
    }
    expect(keys.size).toBe(identities.length);
  });
});
