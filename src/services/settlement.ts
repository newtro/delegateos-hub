import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { escrow, ownerBalances, delegationLog } from "../db/schema.js";
import { InsufficientFundsError, NotFoundError, ValidationError } from "../utils/errors.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Create an escrow hold when a delegation is accepted.
 * Deducts funds from payer's available balance and holds them in escrow.
 * This MUST be transactional.
 */
export async function createEscrow(
  delegationId: string,
  payerOwnerId: string,
  payeeOwnerId: string,
  amountMicrocents: number
): Promise<string> {
  // Calculate platform fee
  const platformFeeMicrocents = Math.floor(
    amountMicrocents * (config.PLATFORM_FEE_PERCENTAGE / 100)
  );

  // Use a transaction to ensure atomicity
  const result = await db.transaction(async (tx) => {
    // Check payer has sufficient balance
    const payerBalance = await tx.query.ownerBalances.findFirst({
      where: (b, { eq }) => eq(b.ownerId, payerOwnerId),
    });

    if (!payerBalance) {
      throw new NotFoundError("Owner balance", payerOwnerId);
    }

    const available =
      payerBalance.balanceMicrocents - payerBalance.heldInEscrowMicrocents;
    if (available < amountMicrocents) {
      throw new InsufficientFundsError(amountMicrocents, available);
    }

    // Hold funds in escrow (increase held amount)
    await tx
      .update(ownerBalances)
      .set({
        heldInEscrowMicrocents: sql`${ownerBalances.heldInEscrowMicrocents} + ${amountMicrocents}`,
      })
      .where(eq(ownerBalances.ownerId, payerOwnerId));

    // Create escrow record
    const [escrowRecord] = await tx
      .insert(escrow)
      .values({
        delegationId,
        payerOwnerId,
        payeeOwnerId,
        amountMicrocents,
        platformFeeMicrocents,
        status: "held",
      })
      .returning();

    return escrowRecord!;
  });

  logger.info(
    {
      escrowId: result.id,
      delegationId,
      amountMicrocents,
      platformFeeMicrocents,
    },
    "escrow created"
  );

  return result.id;
}

/**
 * Release escrow when a delegation completes successfully.
 * Transfers funds (minus platform fee) from payer to payee.
 * This MUST be transactional.
 */
export async function releaseEscrow(delegationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Find the escrow record
    const escrowRecord = await tx.query.escrow.findFirst({
      where: (e, { eq }) => eq(e.delegationId, delegationId),
    });

    if (!escrowRecord) {
      throw new NotFoundError("Escrow for delegation", delegationId);
    }

    if (escrowRecord.status !== "held") {
      throw new ValidationError(
        `Escrow is in '${escrowRecord.status}' status, cannot release`
      );
    }

    const payoutAmount =
      escrowRecord.amountMicrocents - escrowRecord.platformFeeMicrocents;

    // Release payer's held funds and deduct from balance
    await tx
      .update(ownerBalances)
      .set({
        heldInEscrowMicrocents: sql`${ownerBalances.heldInEscrowMicrocents} - ${escrowRecord.amountMicrocents}`,
        balanceMicrocents: sql`${ownerBalances.balanceMicrocents} - ${escrowRecord.amountMicrocents}`,
        totalSpentMicrocents: sql`${ownerBalances.totalSpentMicrocents} + ${escrowRecord.amountMicrocents}`,
      })
      .where(eq(ownerBalances.ownerId, escrowRecord.payerOwnerId));

    // Credit payee (amount minus platform fee)
    await tx
      .update(ownerBalances)
      .set({
        balanceMicrocents: sql`${ownerBalances.balanceMicrocents} + ${payoutAmount}`,
        totalEarnedMicrocents: sql`${ownerBalances.totalEarnedMicrocents} + ${payoutAmount}`,
      })
      .where(eq(ownerBalances.ownerId, escrowRecord.payeeOwnerId));

    // Update escrow status
    await tx
      .update(escrow)
      .set({ status: "released", settledAt: new Date() })
      .where(eq(escrow.id, escrowRecord.id));

    // Update delegation cost
    await tx
      .update(delegationLog)
      .set({ costMicrocents: escrowRecord.amountMicrocents })
      .where(eq(delegationLog.delegationId, delegationId));

    logger.info(
      {
        delegationId,
        payerOwnerId: escrowRecord.payerOwnerId,
        payeeOwnerId: escrowRecord.payeeOwnerId,
        amountMicrocents: escrowRecord.amountMicrocents,
        platformFeeMicrocents: escrowRecord.platformFeeMicrocents,
        payoutAmount,
      },
      "escrow released"
    );
  });
}

/**
 * Refund escrow when a delegation is revoked or fails.
 * Returns held funds to the payer.
 * This MUST be transactional.
 */
export async function refundEscrow(delegationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const escrowRecord = await tx.query.escrow.findFirst({
      where: (e, { eq }) => eq(e.delegationId, delegationId),
    });

    if (!escrowRecord) {
      // No escrow exists for this delegation (e.g., zero-cost delegation)
      return;
    }

    if (escrowRecord.status !== "held") {
      throw new ValidationError(
        `Escrow is in '${escrowRecord.status}' status, cannot refund`
      );
    }

    // Release the hold (return funds to available balance)
    await tx
      .update(ownerBalances)
      .set({
        heldInEscrowMicrocents: sql`${ownerBalances.heldInEscrowMicrocents} - ${escrowRecord.amountMicrocents}`,
      })
      .where(eq(ownerBalances.ownerId, escrowRecord.payerOwnerId));

    // Update escrow status
    await tx
      .update(escrow)
      .set({ status: "refunded", settledAt: new Date() })
      .where(eq(escrow.id, escrowRecord.id));

    logger.info(
      {
        delegationId,
        payerOwnerId: escrowRecord.payerOwnerId,
        amountMicrocents: escrowRecord.amountMicrocents,
      },
      "escrow refunded"
    );
  });
}

/**
 * Get an owner's balance.
 */
export async function getOwnerBalance(ownerId: string) {
  const balance = await db.query.ownerBalances.findFirst({
    where: (b, { eq }) => eq(b.ownerId, ownerId),
  });

  if (!balance) {
    throw new NotFoundError("Owner balance", ownerId);
  }

  return {
    owner_id: balance.ownerId,
    balance_microcents: balance.balanceMicrocents,
    available_microcents:
      balance.balanceMicrocents - balance.heldInEscrowMicrocents,
    held_in_escrow_microcents: balance.heldInEscrowMicrocents,
    total_earned_microcents: balance.totalEarnedMicrocents,
    total_spent_microcents: balance.totalSpentMicrocents,
  };
}

/**
 * Deposit funds into an owner's balance.
 * In production this would integrate with Stripe; for now it's a direct ledger credit.
 */
export async function depositFunds(
  ownerId: string,
  amountMicrocents: number
): Promise<void> {
  if (amountMicrocents <= 0) {
    throw new ValidationError("Deposit amount must be positive");
  }

  const result = await db
    .update(ownerBalances)
    .set({
      balanceMicrocents: sql`${ownerBalances.balanceMicrocents} + ${amountMicrocents}`,
    })
    .where(eq(ownerBalances.ownerId, ownerId))
    .returning();

  if (result.length === 0) {
    throw new NotFoundError("Owner balance", ownerId);
  }

  logger.info({ ownerId, amountMicrocents }, "funds deposited");
}
