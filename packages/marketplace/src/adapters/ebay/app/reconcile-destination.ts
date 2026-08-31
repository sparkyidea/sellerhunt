import type eBayApi from "ebay-api";
import type { ReconcileDestinationOptions } from "../../../types";
import { collectPages, PAGE_LIMIT } from "../notification/helper/paging";

interface DestinationRecord {
  deliveryConfig?: { endpoint?: string; verificationToken?: string };
  destinationId?: string;
  name?: string;
  status?: string;
}

function getAllDestinations(client: eBayApi): Promise<DestinationRecord[]> {
  return collectPages<DestinationRecord>(
    (continuationToken) =>
      client.commerce.notification.getDestinations({
        limit: PAGE_LIMIT,
        continuationToken,
      }),
    "destinations"
  );
}

async function findDestinationByEndpoint(
  client: eBayApi,
  endpoint: string
): Promise<DestinationRecord | null> {
  const destinations = await getAllDestinations(client);
  return (
    destinations.find((d) => d.deliveryConfig?.endpoint === endpoint) ?? null
  );
}

/**
 * Register (or find) the destination for our webhook endpoint.
 * Idempotent: destinations are app-scoped, so lookup-by-endpoint first.
 *
 * `client` MUST be an application-token client — destination methods are
 * app-scoped, and one destination serves every seller's subscriptions.
 *
 * NOTE: creation and endpoint changes trigger eBay's challenge handshake
 * against `endpoint` synchronously — the GET challenge route must already be
 * live and reachable or this call fails.
 */
export async function reconcileDestination(
  client: eBayApi,
  options: ReconcileDestinationOptions
): Promise<string> {
  const destinations = await getAllDestinations(client);
  const existing = destinations.find(
    (d) => d.deliveryConfig?.endpoint === options.endpoint
  );
  if (existing?.destinationId) {
    // eBay marks a destination down when the endpoint keeps failing, and then
    // refuses to enable subscriptions against it (195015) with no way back.
    // updateDestination re-runs the challenge and restores it.
    if (existing.status !== "ENABLED") {
      await client.commerce.notification.updateDestination(
        existing.destinationId,
        {
          name: options.name,
          status: "ENABLED",
          deliveryConfig: {
            endpoint: options.endpoint,
            verificationToken: options.verificationToken,
          },
        }
      );
    }
    return existing.destinationId;
  }

  // Ours by name but pointing somewhere else — the webhook path moved. Repoint
  // in place rather than creating a second one: the subscriptions already bound
  // to this destination follow it, nothing is left registered at the dead
  // endpoint, and we never depend on eBay tolerating two same-named
  // destinations.
  const renamed = destinations.find((d) => d.name === options.name);
  if (renamed?.destinationId) {
    await client.commerce.notification.updateDestination(
      renamed.destinationId,
      {
        name: options.name,
        status: "ENABLED",
        deliveryConfig: {
          endpoint: options.endpoint,
          verificationToken: options.verificationToken,
        },
      }
    );
    return renamed.destinationId;
  }

  const created = (await client.commerce.notification.createDestination({
    name: options.name,
    status: "ENABLED",
    deliveryConfig: {
      endpoint: options.endpoint,
      verificationToken: options.verificationToken,
    },
  })) as { destinationId?: string } | undefined;
  if (created?.destinationId) {
    return created.destinationId;
  }

  // 201 responses carry the id in the Location header, which the SDK doesn't
  // surface — re-query instead of parsing headers.
  const found = await findDestinationByEndpoint(client, options.endpoint);
  if (found?.destinationId) {
    return found.destinationId;
  }
  throw new Error("eBay destination created but could not be resolved");
}
