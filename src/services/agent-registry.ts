import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { agents } from "../db/schema.js";
import { generateAgentKeypair, generateApiKey } from "../utils/crypto.js";
import { toBase64url } from "delegate-os";
import { NotFoundError } from "../utils/errors.js";
import { config } from "../config.js";

export interface AgentRegistrationInput {
  name: string;
  description?: string;
  platform?: string;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OnboardingManifest {
  agent_id: string;
  name: string;
  api_key: string;
  public_key: string;
  private_key: string;
  owner_id: string;
  endpoints: {
    inbox: string;
    delegate: string;
    discover: string;
    sync: string;
    capabilities: string;
    profile: string;
  };
  polling_interval_seconds: number;
  setup_instructions: string[];
  capabilities_template: {
    namespace: string;
    actions: string[];
    pricing: {
      amount_microcents: number;
      model: string;
    };
  };
}

/**
 * Register a new agent for the given owner.
 * Generates keypair and API key, stores agent, returns onboarding manifest.
 */
export async function registerAgent(
  ownerId: string,
  input: AgentRegistrationInput
): Promise<OnboardingManifest> {
  // Verify owner exists
  const owner = await db.query.owners.findFirst({
    where: (o, { eq }) => eq(o.id, ownerId),
  });
  if (!owner) {
    throw new NotFoundError("Owner", ownerId);
  }

  // Generate Ed25519 keypair and API key
  const keypair = await generateAgentKeypair();
  const { rawKey, hash } = await generateApiKey("agent");
  const publicKeyStr = keypair.principal.id;
  const privateKeyStr = toBase64url(keypair.privateKey);

  // Insert agent
  const [agent] = await db
    .insert(agents)
    .values({
      name: input.name,
      description: input.description ?? null,
      ownerId,
      publicKey: publicKeyStr,
      apiKeyHash: hash,
      status: "active",
      platform: input.platform ?? null,
      pollingIntervalSeconds: config.DEFAULT_POLLING_INTERVAL_SECONDS,
      capabilitiesManifest: input.capabilities ?? {},
      metadata: input.metadata ?? {},
    })
    .returning();

  const agentId = agent!.id;
  const baseUrl = config.HUB_URL;

  return {
    agent_id: agentId,
    name: agent!.name,
    api_key: rawKey,
    public_key: publicKeyStr,
    private_key: privateKeyStr,
    owner_id: ownerId,
    endpoints: {
      inbox: `${baseUrl}/api/v1/agents/${agentId}/inbox`,
      delegate: `${baseUrl}/api/v1/delegate`,
      discover: `${baseUrl}/api/v1/discover`,
      sync: `${baseUrl}/api/v1/network/sync`,
      capabilities: `${baseUrl}/api/v1/agents/${agentId}/capabilities`,
      profile: `${baseUrl}/api/v1/agents/${agentId}`,
    },
    polling_interval_seconds: config.DEFAULT_POLLING_INTERVAL_SECONDS,
    setup_instructions: [
      `Store your API key securely. It starts with "dos_agent_" and will not be shown again.`,
      `Store your private key securely. It is needed to sign delegation tokens.`,
      `Poll your inbox at the given endpoint using your API key as a Bearer token.`,
      `Use the discover endpoint to find agents by capability namespace.`,
      `Update your capabilities manifest to advertise what tasks you can handle.`,
      `Set your polling interval based on your availability and latency needs.`,
    ],
    capabilities_template: {
      namespace: "example.capability",
      actions: ["execute", "review"],
      pricing: {
        amount_microcents: 100000,
        model: "per_task",
      },
    },
  };
}

export interface DiscoverFilters {
  namespace?: string;
  action?: string;
  minTier?: number;
  maxPriceMicrocents?: number;
  limit?: number;
  offset?: number;
}

export interface DiscoveredAgent {
  agent_id: string;
  name: string;
  description: string | null;
  owner_id: string;
  capabilities: unknown;
  trust_score: string | null;
  status: string;
  created_at: string;
}

/**
 * Discover agents by capability filters.
 */
export async function discoverAgents(
  filters: DiscoverFilters
): Promise<DiscoveredAgent[]> {
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = filters.offset ?? 0;

  // Base query: only active agents
  let query = db
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      ownerId: agents.ownerId,
      capabilitiesManifest: agents.capabilitiesManifest,
      status: agents.status,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.status, "active"))
    .limit(limit)
    .offset(offset);

  const results = await query;

  // Filter by namespace/action in application code (JSONB filtering)
  let filtered = results;
  if (filters.namespace) {
    filtered = filtered.filter((a) => {
      const manifest = a.capabilitiesManifest as Record<string, unknown>;
      return JSON.stringify(manifest)
        .toLowerCase()
        .includes(filters.namespace!.toLowerCase());
    });
  }

  return filtered.map((a) => ({
    agent_id: a.id,
    name: a.name,
    description: a.description,
    owner_id: a.ownerId,
    capabilities: a.capabilitiesManifest,
    trust_score: null, // Populated later when trust scores exist
    status: a.status,
    created_at: a.createdAt!.toISOString(),
  }));
}

/**
 * Get agent by ID.
 */
export async function getAgentById(agentId: string) {
  const agent = await db.query.agents.findFirst({
    where: (a, { eq }) => eq(a.id, agentId),
  });
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }
  return agent;
}

/**
 * Update agent fields.
 */
export async function updateAgent(
  agentId: string,
  updates: {
    name?: string;
    description?: string;
    platform?: string;
    pollingIntervalSeconds?: number;
    metadata?: Record<string, unknown>;
    status?: "active" | "suspended";
  }
) {
  await getAgentById(agentId);

  const [updated] = await db
    .update(agents)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId))
    .returning();

  return updated;
}

/**
 * Soft-delete an agent (set status to deregistered).
 */
export async function deregisterAgent(agentId: string) {
  const [updated] = await db
    .update(agents)
    .set({ status: "deregistered", updatedAt: new Date() })
    .where(eq(agents.id, agentId))
    .returning();

  if (!updated) {
    throw new NotFoundError("Agent", agentId);
  }
  return updated;
}

/**
 * Update an agent's capabilities manifest.
 */
export async function updateCapabilities(
  agentId: string,
  capabilities: Record<string, unknown>
) {
  const [updated] = await db
    .update(agents)
    .set({
      capabilitiesManifest: capabilities,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId))
    .returning();

  if (!updated) {
    throw new NotFoundError("Agent", agentId);
  }
  return updated;
}
