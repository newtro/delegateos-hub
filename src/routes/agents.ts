import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  requireAuth,
  type AuthAgent,
  type AuthOwner,
} from "../middleware/auth.js";
import type { AppEnv } from "../types.js";
import {
  getAgentById,
  updateAgent,
  deregisterAgent,
  updateCapabilities,
} from "../services/agent-registry.js";
import { ForbiddenError } from "../utils/errors.js";

const agentIdParam = z.object({
  id: z.string().uuid(),
});

const agentProfileSchema = z.object({
  agent_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  owner_id: z.string().uuid(),
  public_key: z.string(),
  status: z.string(),
  platform: z.string().nullable(),
  polling_interval_seconds: z.number().nullable(),
  capabilities: z.any(),
  metadata: z.any(),
  created_at: z.string(),
  updated_at: z.string(),
});

// GET /api/v1/agents/:id
const getAgentRoute = createRoute({
  method: "get",
  path: "/api/v1/agents/{id}",
  tags: ["Agent Registry"],
  summary: "Get agent profile",
  request: {
    params: agentIdParam,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: agentProfileSchema,
        },
      },
      description: "Agent profile",
    },
  },
});

// PATCH /api/v1/agents/:id
const updateAgentRoute = createRoute({
  method: "patch",
  path: "/api/v1/agents/{id}",
  tags: ["Agent Registry"],
  summary: "Update agent metadata",
  security: [{ Bearer: [] }],
  request: {
    params: agentIdParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().min(1).max(255).optional(),
            description: z.string().max(1000).optional(),
            platform: z.string().max(100).optional(),
            polling_interval_seconds: z.number().positive().optional(),
            metadata: z.record(z.unknown()).optional(),
            status: z.enum(["active", "suspended"]).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: agentProfileSchema,
        },
      },
      description: "Updated agent profile",
    },
  },
});

// DELETE /api/v1/agents/:id
const deleteAgentRoute = createRoute({
  method: "delete",
  path: "/api/v1/agents/{id}",
  tags: ["Agent Registry"],
  summary: "Deregister an agent (soft delete)",
  security: [{ Bearer: [] }],
  request: {
    params: agentIdParam,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
            agent_id: z.string().uuid(),
          }),
        },
      },
      description: "Agent deregistered",
    },
  },
});

// POST /api/v1/agents/:id/capabilities
const updateCapabilitiesRoute = createRoute({
  method: "post",
  path: "/api/v1/agents/{id}/capabilities",
  tags: ["Agent Registry"],
  summary: "Update agent capability manifest",
  security: [{ Bearer: [] }],
  request: {
    params: agentIdParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            capabilities: z.record(z.unknown()),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: agentProfileSchema,
        },
      },
      description: "Updated capabilities",
    },
  },
});

function formatAgent(agent: {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  publicKey: string;
  status: string;
  platform: string | null;
  pollingIntervalSeconds: number | null;
  capabilitiesManifest: unknown;
  metadata: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}) {
  return {
    agent_id: agent.id,
    name: agent.name,
    description: agent.description,
    owner_id: agent.ownerId,
    public_key: agent.publicKey,
    status: agent.status,
    platform: agent.platform,
    polling_interval_seconds: agent.pollingIntervalSeconds,
    capabilities: agent.capabilitiesManifest,
    metadata: agent.metadata,
    created_at: agent.createdAt!.toISOString(),
    updated_at: agent.updatedAt!.toISOString(),
  };
}

export function registerAgentCrudRoutes(app: OpenAPIHono<AppEnv>) {
  // GET agent profile (no auth required)
  app.openapi(getAgentRoute, async (c) => {
    const { id } = c.req.valid("param");
    const agent = await getAgentById(id);
    return c.json(formatAgent(agent), 200);
  });

  // PATCH agent (agent auth required, must be same agent)
  app.use("/api/v1/agents/:id", async (c, next) => {
    if (c.req.method === "PATCH") {
      return requireAuth("agent")(c, next);
    }
    if (c.req.method === "DELETE") {
      return requireAuth("owner")(c, next);
    }
    await next();
  });

  app.openapi(updateAgentRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthAgent;

    if (auth.agentId !== id) {
      throw new ForbiddenError("You can only update your own agent profile");
    }

    const body = c.req.valid("json");
    const updated = await updateAgent(id, {
      name: body.name,
      description: body.description,
      platform: body.platform,
      pollingIntervalSeconds: body.polling_interval_seconds,
      metadata: body.metadata,
      status: body.status,
    });

    return c.json(formatAgent(updated!), 200);
  });

  // DELETE agent (owner auth required, must own the agent)
  app.openapi(deleteAgentRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthOwner;

    const agent = await getAgentById(id);
    if (agent.ownerId !== auth.ownerId) {
      throw new ForbiddenError("You can only deregister agents you own");
    }

    await deregisterAgent(id);
    return c.json({ message: "Agent deregistered", agent_id: id }, 200);
  });

  // POST capabilities (agent auth, must be same agent)
  app.use("/api/v1/agents/:id/capabilities", requireAuth("agent"));

  app.openapi(updateCapabilitiesRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthAgent;

    if (auth.agentId !== id) {
      throw new ForbiddenError(
        "You can only update capabilities for your own agent"
      );
    }

    const body = c.req.valid("json");
    const updated = await updateCapabilities(id, body.capabilities);
    return c.json(formatAgent(updated), 200);
  });
}
