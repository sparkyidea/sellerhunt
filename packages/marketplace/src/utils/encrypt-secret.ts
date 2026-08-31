import { EncryptJWT } from "jose";

/**
 * Encrypts a secret string using JWE (JSON Web Encryption)
 * @param secret - The string to encrypt (e.g., access token, refresh token)
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
