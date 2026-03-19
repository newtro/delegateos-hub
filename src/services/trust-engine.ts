import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  trustRelationships,
  trustScores,
} from "../db/schema.js";

export type TrustTier = 1 | 2 | 3;

export interface TrustResolution {
  tier: TrustTier;
  reason: string;
  requesterOwnerId: string;
  providerOwnerId: string;
}

/**
 * Resolve the trust tier between two agents based on their owners' relationship.
 *
 * Tier 1: Same owner (agents belong to the same owner)
 * Tier 2: Trusted partner (explicit trust relationship between owners)
 * Tier 3: Unknown (no trust relationship)
 */
export async function resolveTrustTier(
  requesterAgentId: string,
  providerAgentId: string
): Promise<TrustResolution> {
  // Look up both agents to get their owner IDs
  const requester = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, requesterAgentId),
  });
  const provider = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, providerAgentId),
  });

  if (!requester || !provider) {
    return {
      tier: 3,
      reason: "One or both agents not found",
      requesterOwnerId: requester?.ownerId ?? "",
      providerOwnerId: provider?.ownerId ?? "",
    };
  }

  const requesterOwnerId = requester.ownerId;
  const providerOwnerId = provider.ownerId;

  // Tier 1: Same owner
  if (requesterOwnerId === providerOwnerId) {
    return {
      tier: 1,
      reason: "Same owner",
      requesterOwnerId,
      providerOwnerId,
    };
  }

  // Check for explicit trust relationship (bidirectional check)
  const trustRel = await db.query.trustRelationships.findFirst({
    where: (t, { eq, and, or }) =>
      or(
        and(eq(t.ownerAId, requesterOwnerId), eq(t.ownerBId, providerOwnerId)),
        and(eq(t.ownerAId, providerOwnerId), eq(t.ownerBId, requesterOwnerId))
      ),
  });

  if (trustRel) {
    // Tier 2: Trusted partner
    return {
      tier: 2,
      reason: `Trusted partner (tier ${trustRel.tier})`,
      requesterOwnerId,
      providerOwnerId,
    };
  }

  // Tier 3: Unknown
  return {
    tier: 3,
    reason: "No trust relationship between owners",
    requesterOwnerId,
    providerOwnerId,
  };
}

/**
 * Create or update a trust relationship between two owners.
 */
export async function setTrustRelationship(
  ownerAId: string,
  ownerBId: string,
  tier: 1 | 2
): Promise<void> {
  await db
    .insert(trustRelationships)
    .values({
      ownerAId,
      ownerBId,
      tier,
    })
    .onConflictDoUpdate({
      target: [trustRelationships.ownerAId, trustRelationships.ownerBId],
      set: { tier },
    });
}

/**
 * Update trust scores for an agent after a delegation completes.
 */
export async function updateTrustScore(
  agentId: string,
  capabilityNamespace: string,
  success: boolean,
  _durationMs?: number
): Promise<void> {
  // Get or create trust score entry
  const existing = await db.query.trustScores.findFirst({
    where: (ts, { eq, and }) =>
      and(
        eq(ts.agentId, agentId),
        eq(ts.capabilityNamespace, capabilityNamespace)
      ),
  });

  if (!existing) {
    // Create new score entry
    const totalTasks = 1;
    const successfulTasks = success ? 1 : 0;
    const reliabilityScore = success ? 0.6 : 0.4;
    const qualityScore = success ? 0.6 : 0.4;
    const speedScore = 0.5;
    const compositeScore =
      reliabilityScore * 0.4 + qualityScore * 0.4 + speedScore * 0.2;

    await db.insert(trustScores).values({
      agentId,
      capabilityNamespace,
      compositeScore: compositeScore.toFixed(4),
      reliabilityScore: reliabilityScore.toFixed(4),
      qualityScore: qualityScore.toFixed(4),
      speedScore: speedScore.toFixed(4),
      totalTasks,
      successfulTasks,
      lastUpdated: new Date(),
    });
    return;
  }

  // Update existing scores with exponential moving average
  const alpha = 0.1; // Smoothing factor
  const totalTasks = (existing.totalTasks ?? 0) + 1;
  const successfulTasks =
    (existing.successfulTasks ?? 0) + (success ? 1 : 0);

  const newReliability =
    (1 - alpha) * Number(existing.reliabilityScore) +
    alpha * (success ? 1 : 0);
  const newQuality =
    (1 - alpha) * Number(existing.qualityScore) +
    alpha * (success ? 1 : 0);
  const newSpeed = Number(existing.speedScore); // Speed scoring requires more context
  const newComposite = newReliability * 0.4 + newQuality * 0.4 + newSpeed * 0.2;

  await db
    .update(trustScores)
    .set({
      totalTasks,
      successfulTasks,
      reliabilityScore: newReliability.toFixed(4),
      qualityScore: newQuality.toFixed(4),
      speedScore: newSpeed.toFixed(4),
      compositeScore: newComposite.toFixed(4),
      lastUpdated: new Date(),
    })
    .where(
      and(
        eq(trustScores.agentId, agentId),
        eq(trustScores.capabilityNamespace, capabilityNamespace)
      )
    );
}
