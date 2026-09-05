/**
 * Which scan entities a marketplace adapter can serve. Listing detail is
 * mandatory for every adapter; keyword search and seller catalogs are
 * declared per adapter through `ScanCapabilities` in
 * `@dashseller/marketplace-scan`. Crons skip unsupported sweeps and parent
 * tasks refuse to start, so an unimplemented adapter method never reaches
 * persona failure routing (`markSoftFailure`) and burns a valid persona.
 */
import { getScanCapabilities } from "@dashseller/marketplace-scan";
import type { ScanCapabilities } from "@dashseller/marketplace-scan/types";

export type ScanEntity = "listing" | "seller" | "keyword";

const REQUIRED_CAPABILITY: Record<ScanEntity, keyof ScanCapabilities | null> = {
  listing: null,
  seller: "sellerCatalog",
  keyword: "keywordSearch",
};

/**
 * True when the marketplace adapter implements every method `entity` scans
 * need. Throws for unknown marketplaces, like `createScanClient`.
 */
export function supportsScanEntity(
  marketplace: string,
  entity: ScanEntity
): boolean {
  const required = REQUIRED_CAPABILITY[entity];
  const capabilities = getScanCapabilities(marketplace);
  return required === null || capabilities[required];
}

/** Parent-task guard: fail before any persona or config is loaded. */
export function assertScanEntitySupported(
  marketplace: string,
  entity: ScanEntity
): void {
  if (!supportsScanEntity(marketplace, entity)) {
    throw new Error(
      `Marketplace "${marketplace}" has no ${entity} scan adapter; only listing detail is supported`
    );
  }
}
