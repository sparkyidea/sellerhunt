import type { ScanClient } from "@dashseller/marketplace-scan/types";
import { locals, metadata } from "@trigger.dev/sdk";
import { setMachineMetadata } from "./machine-metadata";
import { MobileProfileTokenManager } from "./mobile-profile-manager";

export interface ScanSessionResources {
  client: ScanClient;
  manager: MobileProfileTokenManager;
}

type ResourceLoader = (marketplace: string) => Promise<ScanSessionResources>;

const scanSessionLocal = locals.create<ScanSession>("scan-session");

async function loadResources(
  marketplace: string
): Promise<ScanSessionResources> {
  const manager = await MobileProfileTokenManager.loadForThisBox(marketplace);
  const client = await manager.createScanClient();
  metadata.set("profileId", manager.profileId);
  return { client, manager };
}

/**
 * Run-scoped owner of worker-bound marketplace resources. Checkpoint restores
 * preserve memory, so `invalidate` discards the complete manager/client pair and
 * forces the next request to resolve the worker and its profile again.
 */
export class ScanSession {
  readonly marketplace: string;
  private readonly loader: ResourceLoader;
  private resources: Promise<ScanSessionResources> | undefined;

  constructor(marketplace: string, loader: ResourceLoader = loadResources) {
    this.marketplace = marketplace;
    this.loader = loader;
  }

  async get(): Promise<ScanSessionResources> {
    this.resources ??= this.loader(this.marketplace);
    try {
      return await this.resources;
    } catch (error) {
      this.resources = undefined;
      throw error;
    }
  }

  invalidate(): void {
    this.resources = undefined;
  }
}

export function createScanSession(marketplace: string): ScanSession {
  const session = new ScanSession(marketplace);
  locals.set(scanSessionLocal, session);
  return session;
}

/** Refresh restored worker state before task execution continues after a wait. */
export async function resumeScanSession(): Promise<void> {
  locals.get(scanSessionLocal)?.invalidate();
  metadata.del("profileId");
  const boxName = await setMachineMetadata();
  if (!boxName) {
    throw new Error(
      "cannot resolve box identity after resume (boxinfo sidecar unreachable); refusing to reuse worker-bound resources"
    );
  }
}
