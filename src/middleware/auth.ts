import type { MiddlewareHandler, Context } from "hono";
import { db } from "../db/client.js";
import { owners, agents } from "../db/schema.js";
import { verifyApiKey, getApiKeyType } from "../utils/crypto.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import type { ApiKeyType } from "../utils/crypto.js";

export interface AuthOwner {
  type: "owner";
  ownerId: string;
  email: string;
  name: string;
  organization: string | null;
}

export interface AuthAgent {
  type: "agent";
  agentId: string;
  ownerId: string;
  name: string;
  status: string;
}

export type AuthEntity = AuthOwner | AuthAgent;

/**
 * Extract bearer token from Authorization header.
 */
function extractBearerToken(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1]!;
}

/**
 * Resolve an API key to the owner or agent entity.
 * Checks all owners/agents until a match is found (Argon2id verification).
 */
async function resolveApiKey(rawKey: string): Promise<AuthEntity | null> {
  const keyType = getApiKeyType(rawKey);
  if (!keyType) return null;

  if (keyType === "owner") {
    const allOwners = await db.select().from(owners);
    for (const owner of allOwners) {
      const match = await verifyApiKey(rawKey, owner.apiKeyHash);
      if (match) {
        return {
          type: "owner",
          ownerId: owner.id,
          email: owner.email,
          name: owner.name,
          organization: owner.organization,
        };
      }
    }
  } else {
    const allAgents = await db
      .select({
        id: agents.id,
        ownerId: agents.ownerId,
        name: agents.name,
        status: agents.status,
        apiKeyHash: agents.apiKeyHash,
      })
      .from(agents);
    for (const agent of allAgents) {
      const match = await verifyApiKey(rawKey, agent.apiKeyHash);
      if (match) {
        if (agent.status !== "active") {
          throw new ForbiddenError("Agent is not active");
        }
        return {
          type: "agent",
          agentId: agent.id,
          ownerId: agent.ownerId,
          name: agent.name,
          status: agent.status,
        };
      }
    }
  }

  return null;
}

/**
 * Authentication middleware. Requires a valid Bearer token.
 * Sets c.set("auth", entity) on success.
 */
export function requireAuth(...allowedTypes: ApiKeyType[]): MiddlewareHandler {
  return async (c, next) => {
    const token = extractBearerToken(c);
    if (!token) {
      throw new UnauthorizedError("Missing Authorization header");
    }

    const entity = await resolveApiKey(token);
    if (!entity) {
      throw new UnauthorizedError("Invalid API key");
    }

    if (allowedTypes.length > 0 && !allowedTypes.includes(entity.type)) {
      throw new ForbiddenError(
        `This endpoint requires ${allowedTypes.join(" or ")} authentication`
      );
    }

    c.set("auth", entity);
    await next();
  };
}

/**
 * Optional auth: resolves the key if present, but does not require it.
 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const token = extractBearerToken(c);
  if (token) {
    const entity = await resolveApiKey(token);
    if (entity) {
      c.set("auth", entity);
    }
  }
  await next();
};
