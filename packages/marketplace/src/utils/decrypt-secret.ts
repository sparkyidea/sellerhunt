import { jwtDecrypt } from "jose";

/**
 * Decrypts a JWE token back to the original secret string
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
