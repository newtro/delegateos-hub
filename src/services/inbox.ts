import { redis, createBlockingRedis, isRedisAvailable } from "./redis.js";
import { db } from "../db/client.js";
import { inboxMessages } from "../db/schema.js";
import { logger } from "../logger.js";
import { eq, and } from "drizzle-orm";

const STREAM_PREFIX = "inbox:";
const GROUP_NAME = "agent-consumers";

function streamKey(agentId: string): string {
  return `${STREAM_PREFIX}${agentId}`;
}

async function ensureConsumerGroup(agentId: string): Promise<void> {
  if (!isRedisAvailable()) return;
  const key = streamKey(agentId);
  try {
    await redis.xgroup("CREATE", key, GROUP_NAME, "0", "MKSTREAM");
  } catch (err: unknown) {
    if (err instanceof Error && !err.message.includes("BUSYGROUP")) {
      throw err;
    }
  }
}

export interface InboxMessagePayload {
  recipientAgentId: string;
  senderAgentId: string | null;
  messageType:
    | "delegation_request"
    | "delegation_response"
    | "task_result"
    | "revocation"
    | "system";
  payload: Record<string, unknown>;
  expiresAt?: Date;
}

/**
 * Send a message to an agent's inbox.
 * Writes to PostgreSQL for durability, and to Redis Streams if available.
 */
export async function sendToInbox(msg: InboxMessagePayload): Promise<string> {
  // Store in PostgreSQL for durability
  const [dbMsg] = await db
    .insert(inboxMessages)
    .values({
      recipientAgentId: msg.recipientAgentId,
      senderAgentId: msg.senderAgentId,
      messageType: msg.messageType,
      payload: msg.payload,
      status: "pending",
      expiresAt: msg.expiresAt ?? null,
    })
    .returning();

  const messageId = dbMsg!.id;

  // Publish to Redis Stream if available
  if (isRedisAvailable()) {
    try {
      await ensureConsumerGroup(msg.recipientAgentId);
      await redis.xadd(
        streamKey(msg.recipientAgentId),
        "*",
        "id",
        messageId,
        "type",
        msg.messageType,
        "sender",
        msg.senderAgentId ?? "",
        "payload",
        JSON.stringify(msg.payload)
      );
    } catch (err) {
      logger.warn({ err }, "Failed to publish to Redis Stream; message stored in PostgreSQL only");
    }
  }

  logger.debug(
    { messageId, recipientAgentId: msg.recipientAgentId, type: msg.messageType },
    "message sent to inbox"
  );

  return messageId;
}

export interface InboxMessage {
  id: string;
  stream_id: string;
  message_type: string;
  sender_agent_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Poll an agent's inbox.
 * Uses Redis Streams XREADGROUP BLOCK if available, falls back to PostgreSQL polling.
 */
export async function pollInbox(
  agentId: string,
  timeoutMs: number = 30000
): Promise<InboxMessage[]> {
  if (isRedisAvailable()) {
    return pollInboxRedis(agentId, timeoutMs);
  }
  return pollInboxPostgres(agentId);
}

/**
 * PostgreSQL fallback: query pending messages directly.
 */
async function pollInboxPostgres(agentId: string): Promise<InboxMessage[]> {
  const rows = await db
    .select()
    .from(inboxMessages)
    .where(
      and(
        eq(inboxMessages.recipientAgentId, agentId),
        eq(inboxMessages.status, "pending")
      )
    )
    .limit(10);

  // Mark them as delivered
  for (const row of rows) {
    await db
      .update(inboxMessages)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(eq(inboxMessages.id, row.id));
  }

  return rows.map((row) => ({
    id: row.id,
    stream_id: row.id,
    message_type: row.messageType,
    sender_agent_id: row.senderAgentId,
    payload: row.payload as Record<string, unknown>,
    created_at: row.createdAt!.toISOString(),
  }));
}

/**
 * Redis Streams inbox polling with XREADGROUP BLOCK.
 */
async function pollInboxRedis(
  agentId: string,
  timeoutMs: number
): Promise<InboxMessage[]> {
  await ensureConsumerGroup(agentId);

  const key = streamKey(agentId);
  const consumerName = `consumer-${agentId}`;
  const blockingRedis = createBlockingRedis();

  if (!blockingRedis) {
    return pollInboxPostgres(agentId);
  }

  try {
    // Check for previously delivered but unacknowledged messages
    const pending = await blockingRedis.xreadgroup(
      "GROUP",
      GROUP_NAME,
      consumerName,
      "COUNT",
      "10",
      "STREAMS",
      key,
      "0"
    );

    const pendingMessages = parseStreamResponse(pending);
    if (pendingMessages.length > 0) {
      await acknowledgeMessages(agentId, pendingMessages.map((m) => m.stream_id));
      await markDelivered(pendingMessages.map((m) => m.id));
      return pendingMessages;
    }

    // Block for new messages
    const result = await blockingRedis.xreadgroup(
      "GROUP",
      GROUP_NAME,
      consumerName,
      "COUNT",
      "10",
      "BLOCK",
      timeoutMs.toString(),
      "STREAMS",
      key,
      ">"
    );

    const messages = parseStreamResponse(result);
    if (messages.length > 0) {
      await acknowledgeMessages(agentId, messages.map((m) => m.stream_id));
      await markDelivered(messages.map((m) => m.id));
    }

    return messages;
  } finally {
    blockingRedis.disconnect();
  }
}

function parseStreamResponse(response: unknown): InboxMessage[] {
  if (!response || !Array.isArray(response)) return [];

  const messages: InboxMessage[] = [];
  for (const [_streamName, entries] of response as [string, [string, string[]][]][]) {
    if (!entries) continue;
    for (const [streamId, fields] of entries) {
      if (!fields || fields.length === 0) continue;

      const fieldMap: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldMap[fields[i]!] = fields[i + 1]!;
      }

      let parsedPayload: Record<string, unknown> = {};
      try {
        parsedPayload = JSON.parse(fieldMap["payload"] ?? "{}");
      } catch {
        parsedPayload = { raw: fieldMap["payload"] };
      }

      messages.push({
        id: fieldMap["id"] ?? streamId,
        stream_id: streamId,
        message_type: fieldMap["type"] ?? "unknown",
        sender_agent_id: fieldMap["sender"] || null,
        payload: parsedPayload,
        created_at: new Date(Number(streamId.split("-")[0])).toISOString(),
      });
    }
  }
  return messages;
}

async function acknowledgeMessages(agentId: string, streamIds: string[]): Promise<void> {
  if (streamIds.length === 0) return;
  await redis.xack(streamKey(agentId), GROUP_NAME, ...streamIds);
}

async function markDelivered(messageIds: string[]): Promise<void> {
  for (const id of messageIds) {
    await db
      .update(inboxMessages)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(and(eq(inboxMessages.id, id), eq(inboxMessages.status, "pending")));
  }
}
