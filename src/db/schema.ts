import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  decimal,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---- owners ----
export const owners = pgTable("owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  organization: varchar("organization", { length: 255 }),
  apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---- agents ----
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    publicKey: varchar("public_key", { length: 255 }).unique().notNull(),
    apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    platform: varchar("platform", { length: 100 }),
    pollingIntervalSeconds: integer("polling_interval_seconds").default(60),
    capabilitiesManifest: jsonb("capabilities_manifest").default({}),
    trustTierOverrides: jsonb("trust_tier_overrides").default({}),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_agents_owner_id").on(table.ownerId),
    index("idx_agents_status").on(table.status),
    check(
      "agents_status_check",
      sql`${table.status} IN ('active', 'suspended', 'deregistered')`
    ),
  ]
);

// ---- trust_relationships ----
export const trustRelationships = pgTable(
  "trust_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAId: uuid("owner_a_id")
      .notNull()
      .references(() => owners.id),
    ownerBId: uuid("owner_b_id")
      .notNull()
      .references(() => owners.id),
    tier: integer("tier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_trust_unique").on(table.ownerAId, table.ownerBId),
    index("idx_trust_owner_a").on(table.ownerAId),
    index("idx_trust_owner_b").on(table.ownerBId),
    check("trust_tier_check", sql`${table.tier} IN (1, 2)`),
  ]
);

// ---- inbox_messages ----
export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientAgentId: uuid("recipient_agent_id")
      .notNull()
      .references(() => agents.id),
    senderAgentId: uuid("sender_agent_id").references(() => agents.id),
    messageType: varchar("message_type", { length: 30 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_inbox_recipient_status").on(
      table.recipientAgentId,
      table.status
    ),
    check(
      "inbox_message_type_check",
      sql`${table.messageType} IN ('delegation_request', 'delegation_response', 'task_result', 'revocation', 'system')`
    ),
    check(
      "inbox_status_check",
      sql`${table.status} IN ('pending', 'delivered', 'processed', 'expired')`
    ),
  ]
);

// ---- delegation_log ----
export const delegationLog = pgTable(
  "delegation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    delegationId: varchar("delegation_id", { length: 255 }).unique().notNull(),
    requesterAgentId: uuid("requester_agent_id")
      .notNull()
      .references(() => agents.id),
    providerAgentId: uuid("provider_agent_id")
      .notNull()
      .references(() => agents.id),
    contractId: varchar("contract_id", { length: 255 }),
    dctHash: varchar("dct_hash", { length: 255 }).notNull(),
    trustTier: integer("trust_tier").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("requested"),
    costMicrocents: integer("cost_microcents").default(0),
    budgetMicrocents: integer("budget_microcents").default(0),
    attestationHash: varchar("attestation_hash", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
  },
  (table) => [
    index("idx_delegation_requester").on(table.requesterAgentId),
    index("idx_delegation_provider").on(table.providerAgentId),
    index("idx_delegation_status").on(table.status),
    check(
      "delegation_status_check",
      sql`${table.status} IN ('requested', 'accepted', 'rejected', 'in_progress', 'completed', 'failed', 'revoked')`
    ),
  ]
);

// ---- trust_scores ----
export const trustScores = pgTable(
  "trust_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    capabilityNamespace: varchar("capability_namespace", {
      length: 100,
    }).notNull(),
    compositeScore: decimal("composite_score", {
      precision: 5,
      scale: 4,
    }).default("0.5"),
    reliabilityScore: decimal("reliability_score", {
      precision: 5,
      scale: 4,
    }).default("0.5"),
    qualityScore: decimal("quality_score", {
      precision: 5,
      scale: 4,
    }).default("0.5"),
    speedScore: decimal("speed_score", { precision: 5, scale: 4 }).default(
      "0.5"
    ),
    totalTasks: integer("total_tasks").default(0),
    successfulTasks: integer("successful_tasks").default(0),
    lastUpdated: timestamp("last_updated", {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_trust_scores_agent_capability").on(
      table.agentId,
      table.capabilityNamespace
    ),
  ]
);

// ---- escrow ----
export const escrow = pgTable("escrow", {
  id: uuid("id").primaryKey().defaultRandom(),
  delegationId: varchar("delegation_id", { length: 255 })
    .notNull()
    .references(() => delegationLog.delegationId),
  payerOwnerId: uuid("payer_owner_id")
    .notNull()
    .references(() => owners.id),
  payeeOwnerId: uuid("payee_owner_id")
    .notNull()
    .references(() => owners.id),
  amountMicrocents: integer("amount_microcents").notNull(),
  platformFeeMicrocents: integer("platform_fee_microcents")
    .notNull()
    .default(0),
  status: varchar("status", { length: 20 }).notNull().default("held"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

// ---- owner_balances ----
export const ownerBalances = pgTable("owner_balances", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => owners.id),
  balanceMicrocents: bigint("balance_microcents", { mode: "number" })
    .notNull()
    .default(0),
  heldInEscrowMicrocents: bigint("held_in_escrow_microcents", {
    mode: "number",
  })
    .notNull()
    .default(0),
  totalEarnedMicrocents: bigint("total_earned_microcents", { mode: "number" })
    .notNull()
    .default(0),
  totalSpentMicrocents: bigint("total_spent_microcents", { mode: "number" })
    .notNull()
    .default(0),
});

// ---- blocked_messages ----
export const blockedMessages = pgTable("blocked_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderAgentId: uuid("sender_agent_id").references(() => agents.id),
  messageHash: varchar("message_hash", { length: 255 }).notNull(),
  matchedCategory: varchar("matched_category", { length: 50 }).notNull(),
  matchedPattern: varchar("matched_pattern", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
