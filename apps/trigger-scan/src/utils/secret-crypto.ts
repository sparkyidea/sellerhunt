import { EncryptJWT, jwtDecrypt } from "jose";

/**
 * JWE (JSON Web Encryption) helpers for the small secret surface the scan
 * worker holds: the device credentials and minted bearers stored on
 * `mobile_profile`. Encrypted with the standalone `ENCRYPTION_SECRET`
 * (see `@dashseller/env/trigger-scan`) so the self-hosted box never needs
 * the marketplace API credential schema.
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
