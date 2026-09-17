import { EncryptJWT, jwtDecrypt } from "jose";

/**
 * JWE (JSON Web Encryption) helpers for the `mobile_profile` secret surface:
 * device credentials and minted bearers. Shared by the scan worker
 * (`apps/trigger-scan`), the DB seed (`seed/mobile-profile.ts`) and the tRPC
 * admin router (`packages/trpc/src/routers/mobile-profile.ts`). Every caller
 * passes the same `ENCRYPTION_SECRET` (validated by its own deployment env:
 * `@dashseller/env/trigger-scan` for the worker, `@dashseller/env/server` for
 * the API) — the key is a function argument here so this module stays env-free.
 */

/**
 * Encrypts a secret string using JWE.
 * @param secret - The string to encrypt (e.g. access token, refresh token)
 * @param encryptionKey - 32-byte encryption key from environment variable
 * @returns Encrypted JWE token string
 */
export async function encryptSecret(
  secret: string,
  encryptionKey: string
): Promise<string> {
  if (!secret) {
    throw new Error("Secret cannot be empty");
  }

  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("Encryption key must be at least 32 characters");
  }

  const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32));

  const jwt = await new EncryptJWT({ secret })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("10y")
    .encrypt(keyBytes);

  return jwt;
}

/**
 * Decrypts a JWE token back to the original secret string.
 * @param encryptedSecret - The JWE token to decrypt
 * @param encryptionKey - 32-byte encryption key from environment variable
 * @returns Decrypted secret string
 */
export async function decryptSecret(
  encryptedSecret: string,
  encryptionKey: string
): Promise<string> {
  if (!encryptedSecret) {
    throw new Error("Encrypted secret cannot be empty");
  }

  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("Encryption key must be at least 32 characters");
  }

  try {
    const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32));
    const { payload } = await jwtDecrypt(encryptedSecret, keyBytes);

    if (!payload.secret || typeof payload.secret !== "string") {
      throw new Error("Invalid encrypted secret format");
    }

    return payload.secret;
  } catch (error) {
    throw new Error(
      `Failed to decrypt secret: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
