import { logger, runs } from "@trigger.dev/sdk";
import {
  entityTag,
  marketplaceTag,
  type ParentEntity,
  referenceFromTag,
  SOURCE_CRON_TAG,
} from "./scan-tags";

export const NON_TERMINAL = [
  "QUEUED",
  "DEQUEUED",
  "EXECUTING",
  "WAITING",
  "DELAYED",
  "PENDING_VERSION",
] as const;

export interface RunIdentity {
  createdAt: Date;
  id: string;
}

/** Visibility-lagged optimization, not an atomic claim. Iterate all API pages. */
export async function inFlight(
  entity: ParentEntity,
  marketplace: string
): Promise<Set<string>> {
  const references = new Set<string>();
  for await (const run of runs.list({
    taskIdentifier: `scan-listings-by-${entity}`,
    tag: marketplaceTag(marketplace),
    status: [...NON_TERMINAL],
    limit: 100,
  })) {
    if (!run.tags.includes(marketplaceTag(marketplace))) {
      continue;
    }
    for (const tag of run.tags) {
      const reference = referenceFromTag(entity, tag);
      if (reference) {
        references.add(reference);
      }
    }
  }
  return references;
}

export async function listingSweepInFlight(
  marketplace: string
): Promise<boolean> {
  for await (const run of runs.list({
    taskIdentifier: "scan-listings-by-ids",
    tag: SOURCE_CRON_TAG,
    status: [...NON_TERMINAL],
    limit: 100,
  })) {
    if (
      run.tags.includes(marketplaceTag(marketplace)) &&
      run.tags.includes(SOURCE_CRON_TAG)
    ) {
      return true;
    }
  }
  return false;
}

export async function olderSiblingRunning(
  entity: ParentEntity,
  reference: string,
  marketplace: string,
  self: RunIdentity
): Promise<string | null> {
  const tag = entityTag(entity, reference);
  if (!tag) {
    return null;
  }
  let oldest: RunIdentity | null = null;
  try {
    for await (const run of runs.list({
      taskIdentifier: `scan-listings-by-${entity}`,
      tag,
      status: [...NON_TERMINAL],
      limit: 100,
    })) {
      if (
        !(
          run.tags.includes(tag) &&
          run.tags.includes(marketplaceTag(marketplace))
        )
      ) {
        continue;
      }
      if (isOlder(run, self) && (!oldest || isOlder(run, oldest))) {
        oldest = run;
      }
    }
  } catch (error) {
    // If lookup fails here, execute the full scan; never claim completion from lookup failure.
    logger.warn("Older scan lookup failed; performing scan", {
      entity,
      marketplace,
      error,
    });
  }
  return oldest?.id ?? null;
}

function isOlder(run: RunIdentity, other: RunIdentity): boolean {
  const delta = run.createdAt.getTime() - other.createdAt.getTime();
  return delta < 0 || (delta === 0 && run.id < other.id);
}
