import type { MiddlewareHandler } from "hono";
import { scanPayload, hashContent } from "../services/dlp.js";
import { DlpBlockedError } from "../utils/errors.js";
import { db } from "../db/client.js";
import { blockedMessages } from "../db/schema.js";
import { logger } from "../logger.js";

/**
 * DLP scanner middleware.
 * Scans request body for sensitive patterns before allowing the request through.
 * Must run BEFORE any message is delivered to any inbox.
 */
export const dlpScanner: MiddlewareHandler = async (c, next) => {
  // Only scan methods that have a body
  const method = c.req.method;
  if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
    await next();
    return;
  }

  // Clone the body for scanning (we need it to pass through)
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    // No JSON body or invalid JSON; skip scanning
    await next();
    return;
  }

  // Scan the payload
  const result = scanPayload(body);

  if (result.blocked) {
    const firstMatch = result.matches[0]!;

    // Log the blocked message (hash only, never the content)
    const contentStr = JSON.stringify(body);
    const contentHash = hashContent(contentStr);

    // Extract sender agent ID from auth context if available
    const auth = c.get("auth") as { agentId?: string } | undefined;
    const senderAgentId = auth?.agentId ?? null;

    // Record in blocked_messages table
    try {
      await db.insert(blockedMessages).values({
        senderAgentId,
        messageHash: contentHash,
        matchedCategory: firstMatch.category,
        matchedPattern: firstMatch.pattern,
      });
    } catch (err) {
      logger.error({ err }, "Failed to log blocked message");
    }

    logger.warn(
      {
        category: firstMatch.category,
        pattern: firstMatch.pattern,
        senderAgentId,
        hash: contentHash.slice(0, 16),
      },
      "DLP blocked content"
    );

    throw new DlpBlockedError(firstMatch.category, firstMatch.pattern);
  }

  await next();
};
