import { sql } from "drizzle-orm";
import { sign, toBase64url, fromBase64url } from "delegate-os";
import { db } from "../db/client.js";
import { agents, delegationLog, trustScores } from "../db/schema.js";
import { redis, isRedisAvailable } from "./redis.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

const SYNC_CACHE_KEY = "sync:document";
const SYNC_CACHE_TTL = 3600; // 1 hour
let memoryCache: { doc: SyncDocument; expiresAt: number } | null = null;

export interface SyncDocument {
  version: string;
  generated_at: string;
  hub_url: string;
  hub_public_key: string;
  network_stats: {
    total_agents: number;
    active_agents: number;
    total_delegations: number;
    completed_delegations: number;
    total_namespaces: number;
  };
  policies: {
    max_delegation_budget_microcents: number;
    platform_fee_percentage: number;
    default_polling_interval_seconds: number;
    dlp_enabled: boolean;
    trust_tiers: {
      tier_1: string;
      tier_2: string;
      tier_3: string;
    };
  };
  capability_taxonomy: string[];
  signature: string;
}

/**
 * Generate a signed network sync document.
 * Caches the result in Redis for performance.
 */
export async function generateSyncDocument(): Promise<SyncDocument> {
  // Check in-memory cache first
  if (memoryCache && memoryCache.expiresAt > Date.now()) {
    return memoryCache.doc;
  }

  // Check Redis cache if available
  if (isRedisAvailable()) {
    try {
      const cached = await redis.get(SYNC_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as SyncDocument;
      }
    } catch {
      // Cache read failed; regenerate
    }
  }

  // Gather network stats
  const [agentStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${agents.status} = 'active')::int`,
    })
    .from(agents);

  const [delegationStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${delegationLog.status} = 'completed')::int`,
    })
    .from(delegationLog);

  const [namespaceStats] = await db
    .select({
      total: sql<number>`count(distinct ${trustScores.capabilityNamespace})::int`,
    })
    .from(trustScores);

  // Get unique capability namespaces
  const namespaces = await db
    .selectDistinct({ namespace: trustScores.capabilityNamespace })
    .from(trustScores)
    .limit(100);

  // Build the document payload (without signature)
  const payload = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    hub_url: config.HUB_URL,
    hub_public_key: config.HUB_PUBLIC_KEY ?? "",
    network_stats: {
      total_agents: agentStats?.total ?? 0,
      active_agents: agentStats?.active ?? 0,
      total_delegations: delegationStats?.total ?? 0,
      completed_delegations: delegationStats?.completed ?? 0,
      total_namespaces: namespaceStats?.total ?? 0,
    },
    policies: {
      max_delegation_budget_microcents: 100_000_000, // 1000 USD
      platform_fee_percentage: config.PLATFORM_FEE_PERCENTAGE,
      default_polling_interval_seconds: config.DEFAULT_POLLING_INTERVAL_SECONDS,
      dlp_enabled: true,
      trust_tiers: {
        tier_1: "Same owner: full trust, all capabilities",
        tier_2: "Trusted partner: elevated trust, declared capabilities",
        tier_3: "Unknown: basic trust, limited capabilities",
      },
    },
    capability_taxonomy: namespaces.map((n) => n.namespace),
  };

  // Sign the document with Hub's Ed25519 key
  let signature = "";
  if (config.HUB_PRIVATE_KEY) {
    try {
      const payloadBytes = new TextEncoder().encode(
        JSON.stringify(payload)
      );
      const privateKeyBytes = fromBase64url(config.HUB_PRIVATE_KEY);
      const sig = await sign(payloadBytes, privateKeyBytes);
      signature = toBase64url(sig);
    } catch (err) {
      logger.error({ err }, "Failed to sign sync document");
    }
  }

  const doc: SyncDocument = {
    ...payload,
    signature,
  };

  // Cache in memory
  memoryCache = { doc, expiresAt: Date.now() + SYNC_CACHE_TTL * 1000 };

  // Cache in Redis if available
  if (isRedisAvailable()) {
    try {
      await redis.set(SYNC_CACHE_KEY, JSON.stringify(doc), "EX", SYNC_CACHE_TTL);
    } catch {
      // Redis write failed; memory cache is sufficient
    }
  }

  return doc;
}

/**
 * Invalidate the cached sync document (e.g., on policy change).
 */
export async function invalidateSyncCache(): Promise<void> {
  memoryCache = null;
  if (isRedisAvailable()) {
    try {
      await redis.del(SYNC_CACHE_KEY);
    } catch {
      // Redis unavailable; memory cache already cleared
    }
  }
}
