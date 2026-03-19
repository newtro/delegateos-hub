import Redis from "ioredis";
import { config } from "../config.js";
import { logger } from "../logger.js";

let redisAvailable = false;

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) {
      logger.warn("Redis unavailable after 3 retries; running without Redis");
      return null; // Stop retrying
    }
    return Math.min(times * 200, 1000);
  },
});

redis.on("error", (err) => {
  if (redisAvailable) {
    logger.error({ err }, "Redis connection error");
  }
  redisAvailable = false;
});

redis.on("connect", () => {
  redisAvailable = true;
  logger.info("Redis connected");
});

/**
 * Check if Redis is currently available.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Try to connect to Redis. Returns true if successful.
 */
export async function tryConnectRedis(): Promise<boolean> {
  try {
    await redis.connect();
    redisAvailable = true;
    return true;
  } catch {
    logger.warn("Redis not available; inbox polling and rate limiting will use fallbacks");
    redisAvailable = false;
    return false;
  }
}

/**
 * Create a separate Redis connection for blocking operations (XREADGROUP BLOCK).
 * Blocking commands occupy the connection, so we need a dedicated one.
 * Returns null if Redis is not available.
 */
export function createBlockingRedis(): Redis | null {
  if (!redisAvailable) return null;
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
