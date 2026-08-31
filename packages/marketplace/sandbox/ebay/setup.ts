/**
 * Sandbox setup — loads env, connects to DB, fetches & decrypts eBay tokens
 * for a given channel ID.
 *
 * Usage: import { getCredentials } from "./setup"
 *
 * Requires .env in apps/api/ with DATABASE_URL, ENCRYPTION_SECRET,
 * EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
 */
import { resolve } from "node:path";
import { channel, channelToken } from "@dashseller/db/schema";
import { decryptSecret } from "@dashseller/marketplace/utils/decrypt-secret";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

// Load sandbox .env first (for EBAY_CHANNEL_ID), then server .env (for DB, eBay credentials)
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
}

export async function getCredentials(
  channelId: string
): Promise<SandboxCredentials> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const encryptionSecret = requireEnv("ENCRYPTION_SECRET");
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const clientSecret = requireEnv("EBAY_CLIENT_SECRET");

  const db = drizzle(databaseUrl);

  const [tokenRow] = await db
    .select()
    .from(channelToken)
    .where(eq(channelToken.channelId, channelId))
    .limit(1);

  if (!tokenRow) {
    const channels = await db
      .select({
        id: channel.id,
        displayName: channel.displayName,
        reference: channel.reference,
      })
      .from(channel)
      .limit(10);

    console.error("Available channels:", channels);
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

  return { clientId, clientSecret, accessToken, refreshToken };
}
