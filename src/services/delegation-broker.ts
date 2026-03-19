import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { verifyDCT, inspectDCT } from "delegate-os";
import type { SerializedDCT } from "delegate-os";
import { db } from "../db/client.js";
import { delegationLog } from "../db/schema.js";
import { sendToInbox } from "./inbox.js";
import { resolveTrustTier, updateTrustScore } from "./trust-engine.js";
import { createEscrow, releaseEscrow, refundEscrow } from "./settlement.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { logger } from "../logger.js";

export interface DelegationRequest {
  requesterAgentId: string;
  providerAgentId: string;
  dct: string;
  contractId?: string;
  budgetMicrocents?: number;
  metadata?: Record<string, unknown>;
}

export interface DelegationResult {
  delegation_id: string;
  status: string;
  trust_tier: number;
  requester_agent_id: string;
  provider_agent_id: string;
  created_at: string;
}

/**
 * Submit a new delegation request.
 * Verifies the DCT, resolves trust tier, creates the delegation log entry,
 * and sends a message to the provider's inbox.
 */
export async function submitDelegation(
  req: DelegationRequest
): Promise<DelegationResult> {
  // Verify the provider agent exists and is active
  const provider = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, req.providerAgentId),
  });
  if (!provider || provider.status !== "active") {
    throw new NotFoundError("Provider agent", req.providerAgentId);
  }

  // Verify the requester agent exists
  const requester = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, req.requesterAgentId),
  });
  if (!requester) {
    throw new NotFoundError("Requester agent", req.requesterAgentId);
  }

  // Verify DCT signature using the SDK
  let dctHash: string;
  try {
    // Parse the DCT (could be a serialized object or a JSON string)
    let serializedDCT: SerializedDCT;
    if (typeof req.dct === "string") {
      try {
        serializedDCT = JSON.parse(req.dct) as SerializedDCT;
      } catch {
        // If not JSON, wrap as a token
        serializedDCT = { token: req.dct, format: "delegateos-sjt-v1" };
      }
    } else {
      serializedDCT = req.dct as unknown as SerializedDCT;
    }

    // Inspect DCT to extract metadata
    const dctInfo = inspectDCT(serializedDCT);

    // Verify with a context built from the DCT's own capabilities
    const capability = dctInfo.capabilities[0];
    const verifyResult = verifyDCT(serializedDCT, {
      resource: capability?.resource ?? "*",
      operation: capability?.action ?? "execute",
      namespace: capability?.namespace,
      now: new Date().toISOString(),
      spentMicrocents: 0,
      rootPublicKey: dctInfo.issuer,
    });
    if (!verifyResult.ok) {
      throw new ValidationError(
        `DCT verification failed: ${verifyResult.error.type}`
      );
    }
    // Hash the token for logging (never store full DCT)
    dctHash = Buffer.from(serializedDCT.token).toString("base64url").slice(0, 64);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(
      `DCT verification failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  // Resolve trust tier between the agents' owners
  const trustResolution = await resolveTrustTier(
    req.requesterAgentId,
    req.providerAgentId
  );

  // Generate a unique delegation ID
  const delegationId = `del_${randomUUID().replace(/-/g, "")}`;

  // Create delegation log entry
  const [delegation] = await db
    .insert(delegationLog)
    .values({
      delegationId,
      requesterAgentId: req.requesterAgentId,
      providerAgentId: req.providerAgentId,
      contractId: req.contractId ?? null,
      dctHash,
      trustTier: trustResolution.tier,
      status: "requested",
      budgetMicrocents: req.budgetMicrocents ?? 0,
      metadata: req.metadata ?? {},
    })
    .returning();

  // Send delegation request to provider's inbox
  await sendToInbox({
    recipientAgentId: req.providerAgentId,
    senderAgentId: req.requesterAgentId,
    messageType: "delegation_request",
    payload: {
      delegation_id: delegationId,
      requester_agent_id: req.requesterAgentId,
      requester_name: requester.name,
      trust_tier: trustResolution.tier,
      trust_reason: trustResolution.reason,
      contract_id: req.contractId,
      budget_microcents: req.budgetMicrocents ?? 0,
      dct: req.dct,
      metadata: req.metadata ?? {},
    },
  });

  logger.info(
    {
      delegationId,
      requester: req.requesterAgentId,
      provider: req.providerAgentId,
      trustTier: trustResolution.tier,
    },
    "delegation submitted"
  );

  return {
    delegation_id: delegationId,
    status: "requested",
    trust_tier: trustResolution.tier,
    requester_agent_id: req.requesterAgentId,
    provider_agent_id: req.providerAgentId,
    created_at: delegation!.createdAt!.toISOString(),
  };
}

/**
 * Accept a delegation request. Only the provider agent can accept.
 */
export async function acceptDelegation(
  delegationId: string,
  providerAgentId: string
): Promise<void> {
  const delegation = await getDelegation(delegationId);

  if (delegation.providerAgentId !== providerAgentId) {
    throw new ValidationError("Only the provider agent can accept this delegation");
  }
  if (delegation.status !== "requested") {
    throw new ValidationError(
      `Cannot accept delegation in '${delegation.status}' status`
    );
  }

  await db
    .update(delegationLog)
    .set({ status: "accepted" })
    .where(eq(delegationLog.delegationId, delegationId));

  // Create escrow if budget > 0
  if (delegation.budgetMicrocents && delegation.budgetMicrocents > 0) {
    // Look up owner IDs for requester and provider agents
    const requesterAgent = await db.query.agents.findFirst({
      where: (a, { eq }) => eq(a.id, delegation.requesterAgentId),
    });
    const providerAgent = await db.query.agents.findFirst({
      where: (a, { eq }) => eq(a.id, providerAgentId),
    });
    if (requesterAgent && providerAgent) {
      await createEscrow(
        delegationId,
        requesterAgent.ownerId,
        providerAgent.ownerId,
        delegation.budgetMicrocents
      );
    }
  }

  // Notify requester that delegation was accepted
  await sendToInbox({
    recipientAgentId: delegation.requesterAgentId,
    senderAgentId: providerAgentId,
    messageType: "delegation_response",
    payload: {
      delegation_id: delegationId,
      status: "accepted",
    },
  });

  logger.info({ delegationId, providerAgentId }, "delegation accepted");
}

/**
 * Reject a delegation request. Only the provider agent can reject.
 */
export async function rejectDelegation(
  delegationId: string,
  providerAgentId: string,
  reason?: string
): Promise<void> {
  const delegation = await getDelegation(delegationId);

  if (delegation.providerAgentId !== providerAgentId) {
    throw new ValidationError("Only the provider agent can reject this delegation");
  }
  if (delegation.status !== "requested") {
    throw new ValidationError(
      `Cannot reject delegation in '${delegation.status}' status`
    );
  }

  await db
    .update(delegationLog)
    .set({ status: "rejected", completedAt: new Date() })
    .where(eq(delegationLog.delegationId, delegationId));

  await sendToInbox({
    recipientAgentId: delegation.requesterAgentId,
    senderAgentId: providerAgentId,
    messageType: "delegation_response",
    payload: {
      delegation_id: delegationId,
      status: "rejected",
      reason: reason ?? "Delegation rejected by provider",
    },
  });

  logger.info({ delegationId, providerAgentId, reason }, "delegation rejected");
}

/**
 * Complete a delegation. Provider submits the result/attestation.
 */
export async function completeDelegation(
  delegationId: string,
  providerAgentId: string,
  result: Record<string, unknown>,
  attestationHash?: string
): Promise<void> {
  const delegation = await getDelegation(delegationId);

  if (delegation.providerAgentId !== providerAgentId) {
    throw new ValidationError("Only the provider agent can complete this delegation");
  }
  if (delegation.status !== "accepted" && delegation.status !== "in_progress") {
    throw new ValidationError(
      `Cannot complete delegation in '${delegation.status}' status`
    );
  }

  await db
    .update(delegationLog)
    .set({
      status: "completed",
      completedAt: new Date(),
      attestationHash: attestationHash ?? null,
    })
    .where(eq(delegationLog.delegationId, delegationId));

  // Send result to requester's inbox
  await sendToInbox({
    recipientAgentId: delegation.requesterAgentId,
    senderAgentId: providerAgentId,
    messageType: "task_result",
    payload: {
      delegation_id: delegationId,
      status: "completed",
      result,
      attestation_hash: attestationHash,
    },
  });

  // Release escrow on completion
  try {
    await releaseEscrow(delegationId);
  } catch {
    // No escrow for zero-cost delegations; that is fine
  }

  // Update trust score for the provider
  const capabilityNamespace =
    (delegation.metadata as Record<string, unknown>)?.capability_namespace as string ??
    "general";
  await updateTrustScore(providerAgentId, capabilityNamespace, true);

  logger.info({ delegationId, providerAgentId }, "delegation completed");
}

/**
 * Revoke a delegation. Either the requester or provider can revoke.
 */
export async function revokeDelegation(
  delegationId: string,
  agentId: string,
  reason?: string
): Promise<void> {
  const delegation = await getDelegation(delegationId);

  const isRequester = delegation.requesterAgentId === agentId;
  const isProvider = delegation.providerAgentId === agentId;

  if (!isRequester && !isProvider) {
    throw new ValidationError("Only the requester or provider can revoke this delegation");
  }

  const terminalStatuses = ["completed", "failed", "revoked", "rejected"];
  if (terminalStatuses.includes(delegation.status)) {
    throw new ValidationError(
      `Cannot revoke delegation in '${delegation.status}' status`
    );
  }

  await db
    .update(delegationLog)
    .set({ status: "revoked", completedAt: new Date() })
    .where(eq(delegationLog.delegationId, delegationId));

  // Refund escrow on revocation
  try {
    await refundEscrow(delegationId);
  } catch {
    // No escrow for zero-cost delegations; that is fine
  }

  // Notify the other party
  const recipientId = isRequester
    ? delegation.providerAgentId
    : delegation.requesterAgentId;

  await sendToInbox({
    recipientAgentId: recipientId,
    senderAgentId: agentId,
    messageType: "revocation",
    payload: {
      delegation_id: delegationId,
      status: "revoked",
      revoked_by: agentId,
      reason: reason ?? "Delegation revoked",
    },
  });

  // Update trust score (failure for provider if requester revoked)
  if (isRequester) {
    const capabilityNamespace =
      (delegation.metadata as Record<string, unknown>)?.capability_namespace as string ??
      "general";
    await updateTrustScore(delegation.providerAgentId, capabilityNamespace, false);
  }

  logger.info({ delegationId, agentId, reason }, "delegation revoked");
}

/**
 * Get a delegation by ID.
 */
export async function getDelegation(delegationId: string) {
  const delegation = await db.query.delegationLog.findFirst({
    where: (d, { eq }) => eq(d.delegationId, delegationId),
  });
  if (!delegation) {
    throw new NotFoundError("Delegation", delegationId);
  }
  return delegation;
}
