import { idempotencyKeys } from "@trigger.dev/sdk";

interface ScanLaunchOptions {
  idempotencyKey: Awaited<ReturnType<typeof idempotencyKeys.create>>;
  idempotencyKeyTTL: "2h";
}

/** Launch suppression is independent of the entity's successful-scan cadence. */
export async function scanLaunchOptions(
  entity: "keyword" | "seller",
  marketplace: string,
  reference: string,
  createKey: typeof idempotencyKeys.create = idempotencyKeys.create
): Promise<ScanLaunchOptions> {
  return {
    idempotencyKey: await createKey(
      JSON.stringify([entity, marketplace, reference]),
      { scope: "global" }
    ),
    idempotencyKeyTTL: "2h",
  };
}
