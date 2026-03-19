import type { MiddlewareHandler } from "hono";
import { redis, isRedisAvailable } from "../services/redis.js";
import { logger } from "../logger.js";

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
  tokens = max_tokens
  last_refill = now
end

local elapsed = now - last_refill
local new_tokens = elapsed * refill_rate / 1000
tokens = math.min(max_tokens, tokens + new_tokens)

if tokens < 1 then
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
  redis.call('EXPIRE', key, 60)
  return 0
end

tokens = tokens - 1
redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
redis.call('EXPIRE', key, 60)
return 1
`;

// In-memory token buckets for when Redis is unavailable
const memBuckets = new Map<string, { tokens: number; lastRefill: number }>();

interface RateLimitConfig {
  maxTokens: number;
  refillRatePerSecond: number;
  keyPrefix: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: 10,
  refillRatePerSecond: 1,
  keyPrefix: "ratelimit:",
};

function checkInMemory(entityId: string, cfg: RateLimitConfig): boolean {
  const now = Date.now();
  let bucket = memBuckets.get(entityId);
  if (!bucket) {
    bucket = { tokens: cfg.maxTokens, lastRefill: now };
    memBuckets.set(entityId, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(
    cfg.maxTokens,
    bucket.tokens + (elapsed * cfg.refillRatePerSecond) / 1000
  );
  bucket.lastRefill = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function createRateLimiter(
  config: Partial<RateLimitConfig> = {}
): MiddlewareHandler {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return async (c, next) => {
    const auth = c.get("auth") as
      | { agentId?: string; ownerId?: string }
      | undefined;
    const entityId =
      auth?.agentId ??
      auth?.ownerId ??
      c.req.header("x-forwarded-for") ??
      "anonymous";

    let allowed: boolean;

    if (isRedisAvailable()) {
      const key = `${cfg.keyPrefix}${entityId}`;
      const now = Date.now();
      const result = await redis.eval(
        RATE_LIMIT_LUA,
        1,
        key,
        cfg.maxTokens.toString(),
        (cfg.refillRatePerSecond * 1000).toString(),
        now.toString()
      );
      allowed = result !== 0;
    } else {
      allowed = checkInMemory(entityId, cfg);
    }

    if (!allowed) {
      logger.warn({ entityId }, "rate limit exceeded");
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please try again later.",
          },
        },
        429
      );
    }

    c.header("X-RateLimit-Limit", cfg.maxTokens.toString());
    await next();
  };
}

export const rateLimiter = createRateLimiter();
