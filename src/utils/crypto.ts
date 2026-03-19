import { generateKeypair, toBase64url } from "delegate-os";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";

export type ApiKeyType = "owner" | "agent";

const API_KEY_PREFIX: Record<ApiKeyType, string> = {
  owner: "dos_owner_",
  agent: "dos_agent_",
};

/**
 * Generate a new Ed25519 keypair using the SDK.
 */
export async function generateAgentKeypair() {
  return generateKeypair();
}

/**
 * Generate a prefixed API key for owners or agents.
 * Returns the raw key (to show the user once) and the hash (to store).
 */
export async function generateApiKey(
  type: ApiKeyType
): Promise<{ rawKey: string; hash: string }> {
  const bytes = randomBytes(32);
  const rawKey = API_KEY_PREFIX[type] + toBase64url(bytes);
  const hash = await hashApiKey(rawKey);
  return { rawKey, hash };
}

/**
 * Hash an API key with Argon2id (19 MiB memory, 2 iterations).
 */
export async function hashApiKey(key: string): Promise<string> {
  return argon2.hash(key, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verify an API key against a stored hash.
 */
export async function verifyApiKey(
  key: string,
  hash: string
): Promise<boolean> {
  return argon2.verify(hash, key);
}

/**
 * Extract the type (owner or agent) from an API key prefix.
 * Returns null if the key does not have a recognized prefix.
 */
export function getApiKeyType(key: string): ApiKeyType | null {
  if (key.startsWith(API_KEY_PREFIX.owner)) return "owner";
  if (key.startsWith(API_KEY_PREFIX.agent)) return "agent";
  return null;
}
