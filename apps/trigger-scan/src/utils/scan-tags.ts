import { logger } from "@trigger.dev/sdk";

export const SOURCE_CRON_TAG = "scan_source_cron";
const MAX_TAG_LENGTH = 128;
export type ParentEntity = "keyword" | "seller";

export function marketplaceTag(marketplace: string): string {
  return `marketplace_${marketplace}`;
}

export function entityTag(
  entity: ParentEntity,
  reference: string
): string | null {
  const tag = `scan_${entity}_${reference}`;
  if (tag.length > MAX_TAG_LENGTH) {
    logger.warn(
      "Scan reference exceeds entity tag length; deduplication unavailable",
      {
        entity,
        referenceLength: reference.length,
      }
    );
    return null;
  }
  return tag;
}

export function referenceFromTag(
  entity: ParentEntity,
  tag: string
): string | null {
  const prefix = `scan_${entity}_`;
  return tag.startsWith(prefix) ? tag.slice(prefix.length) : null;
}

export function launchTags(
  marketplace: string,
  entity: ParentEntity,
  reference: string
): string[] {
  const tag = entityTag(entity, reference);
  return tag
    ? [marketplaceTag(marketplace), tag]
    : [marketplaceTag(marketplace)];
}
