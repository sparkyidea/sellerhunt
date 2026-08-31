/**
 * Live-loop tester for the webhook receiver. Signs REAL Shopify-shaped
 * deliveries with the local SHOPIFY_CLIENT_SECRET (the exact HMAC the
 * receiver verifies) and exercises the eBay challenge handshake. eBay
 * POST deliveries can't be forged — their ECDSA key is eBay's — so the
 * eBay live loop is: challenge here, real notifications from the sandbox.
 *
 *   bun scripts/send-test-webhook.ts orders-updated --shop my.myshopify.com --resource 123
 *   bun scripts/send-test-webhook.ts products-delete --shop my.myshopify.com --resource 456
 *   bun scripts/send-test-webhook.ts app-uninstalled --shop my.myshopify.com
 *   bun scripts/send-test-webhook.ts ebay-challenge
 *
 * Flags: --url (default http://localhost:8788 — the WORKER serves the
 * receiver), --shop, --resource. Env: SHOPIFY_CLIENT_SECRET +
 * EBAY_WEBHOOK_VERIFICATION_TOKEN from apps/worker/.env (dotenv),
 * overridable by the process environment.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
});

function flag(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const fixture = process.argv[2];
const baseUrl = flag("url", "http://localhost:8788") as string;
const shop = flag("shop", "dashseller-dev.myshopify.com") as string;
const resource = flag("resource", "1234567890");

interface ShopifyFixture {
  payload: Record<string, unknown>;
  topic: string;
}

const SHOPIFY_FIXTURES: Record<string, ShopifyFixture> = {
  "orders-created": {
    topic: "orders/create",
    payload: {
      id: Number(resource),
      admin_graphql_api_id: `gid://shopify/Order/${resource}`,
    },
  },
  "orders-updated": {
    topic: "orders/updated",
    payload: {
      id: Number(resource),
      admin_graphql_api_id: `gid://shopify/Order/${resource}`,
    },
  },
  "products-update": {
    topic: "products/update",
    payload: {
      id: Number(resource),
      admin_graphql_api_id: `gid://shopify/Product/${resource}`,
    },
  },
  "products-delete": {
    topic: "products/delete",
    payload: { id: Number(resource) },
  },
  "app-uninstalled": {
    topic: "app/uninstalled",
    payload: { id: 1, myshopify_domain: shop },
  },
};

async function sendShopify(entry: ShopifyFixture): Promise<void> {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error("SHOPIFY_CLIENT_SECRET is not set");
    process.exit(1);
  }
  const rawBody = JSON.stringify(entry.payload);
  const hmac = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  const response = await fetch(`${baseUrl}/webhook/shopify`, {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": entry.topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": randomUUID(),
      "x-shopify-event-id": randomUUID(),
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-triggered-at": new Date().toISOString(),
    },
  });
  console.log(`${entry.topic} -> ${response.status}`);
  const text = await response.text();
  if (text) {
    console.log(text);
  }
}

async function sendEbayChallenge(): Promise<void> {
  const token = process.env.EBAY_WEBHOOK_VERIFICATION_TOKEN;
  if (!token) {
    console.error("EBAY_WEBHOOK_VERIFICATION_TOKEN is not set");
    process.exit(1);
  }
  const challengeCode = randomUUID();
  const response = await fetch(
    `${baseUrl}/webhook/ebay?challenge_code=${challengeCode}`
  );
  const body = (await response.json()) as { challengeResponse?: string };
  // The receiver hashes against ITS OWN WEBHOOK_BASE_URL (the URL eBay
  // was given), not against whatever host this script dialed — read the
  // same env the worker does so the loop verifies the registered-endpoint
  // hash.
  const endpoint = new URL(
    "/webhook/ebay",
    process.env.WEBHOOK_BASE_URL ?? baseUrl
  ).toString();
  const expected = createHash("sha256")
    .update(challengeCode)
    .update(token)
    .update(endpoint)
    .digest("hex");
  const ok = body.challengeResponse === expected;
  console.log(
    `challenge -> ${response.status} ${ok ? "HASH OK" : "HASH MISMATCH"}`
  );
  if (!ok) {
    console.log({ got: body.challengeResponse, expected });
    console.log(
      "Note: the receiver hashes against WEBHOOK_BASE_URL from its env — a " +
        "mismatch usually means --url and the worker's WEBHOOK_BASE_URL differ."
    );
    process.exit(1);
  }
}

if (fixture === "ebay-challenge") {
  await sendEbayChallenge();
} else if (fixture && SHOPIFY_FIXTURES[fixture]) {
  await sendShopify(SHOPIFY_FIXTURES[fixture]);
} else {
  console.error(
    `Unknown fixture "${fixture ?? ""}". Available: ${[
      ...Object.keys(SHOPIFY_FIXTURES),
      "ebay-challenge",
    ].join(", ")}`
  );
  process.exit(1);
}
