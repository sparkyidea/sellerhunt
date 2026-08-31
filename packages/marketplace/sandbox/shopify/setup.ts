/**
 * Sandbox setup — loads env, connects to DB, fetches & decrypts the Shopify
 * offline access token + the canonical shop URL for a given channel ID.
 *
 * Usage: import { getCredentials } from "./setup"
 *
 * Requires:
 * - sandbox/.env  → SHOPIFY_CHANNEL_ID
 * - apps/api/.env → DATABASE_URL, ENCRYPTION_SECRET, SHOPIFY_CLIENT_ID,
 *   SHOPIFY_CLIENT_SECRET
 */
import { resolve } from "node:path";
import { channel, channelToken } from "@dashseller/db/schema";
import { decryptSecret } from "@dashseller/marketplace/utils/decrypt-secret";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

const sandboxEnvPath = resolve(import.meta.dirname, "../.env");
const serverEnvPath = resolve(import.meta.dirname, "../../../../apps/api/.env");
dotenv.config({ path: sandboxEnvPath });
dotenv.config({ path: serverEnvPath });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var: ${name}. Check ${sandboxEnvPath} or ${serverEnvPath}`
    );
  }
  return value;
}

export interface SandboxCredentials {
  accessToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  shopUrl: string;
}

export async function getCredentials(
  channelId: string
): Promise<SandboxCredentials> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const encryptionSecret = requireEnv("ENCRYPTION_SECRET");
  const clientId = requireEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = requireEnv("SHOPIFY_CLIENT_SECRET");

  const db = drizzle(databaseUrl);

  const [channelRow] = await db
    .select({
      id: channel.id,
      reference: channel.reference,
      displayName: channel.displayName,
    })
    .from(channel)
    .where(eq(channel.id, channelId))
    .limit(1);

  if (!channelRow) {
    const channels = await db
      .select({
        id: channel.id,
        displayName: channel.displayName,
        reference: channel.reference,
      })
      .from(channel)
      .limit(10);

    console.error("Available channels:", channels);
    throw new Error(`No channel found for ID: ${channelId}`);
  }

  if (!channelRow.reference) {
    throw new Error(
      `Channel ${channelId} has no reference (shopUrl) — Shopify channels require channel.reference to be set during OAuth callback`
    );
  }

  const [tokenRow] = await db
    .select()
    .from(channelToken)
    .where(eq(channelToken.channelId, channelId))
    .limit(1);

  if (!tokenRow) {
    throw new Error(`No token found for channel ID: ${channelId}`);
  }

  const accessToken = await decryptSecret(
    tokenRow.accessToken,
    encryptionSecret
  );
  const refreshToken = await decryptSecret(
    tokenRow.refreshToken,
    encryptionSecret
  );

  return {
    accessToken,
    clientId,
    clientSecret,
    refreshToken,
    shopUrl: channelRow.reference,
  };
}
