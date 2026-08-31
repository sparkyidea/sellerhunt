// hendt's NotificationParams types `limit` as a string query param.
export const PAGE_LIMIT = "100";

/** Continuation tokens ride in the `next` href of search responses. */
function parseContinuationToken(next?: string): string | undefined {
  if (!next) {
    return;
  }
  try {
    return (
      new URL(next, "https://api.ebay.com").searchParams.get(
        "continuation_token"
      ) ?? undefined
    );
  } catch {
    return;
  }
}

/**
 * Drain a paged Notification API search into a flat array — every list
 * endpoint here shares the `{ [key]: [...], next }` shape.
 *
 * Shared by the seller-token subscription reads and the app-token destination
 * reads, which are otherwise handled by different clients.
 */
export async function collectPages<T>(
  fetchPage: (
    continuationToken?: string
  ) => Promise<Record<string, unknown> & { next?: string }>,
  key: string
): Promise<T[]> {
  const all: T[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await fetchPage(continuationToken);
    const items = page[key];
    if (Array.isArray(items)) {
      all.push(...(items as T[]));
    }
    continuationToken = parseContinuationToken(page.next);
  } while (continuationToken);
  return all;
}
