import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";
import { requireAuth, type AuthOwner } from "../middleware/auth.js";
import { registerAgent } from "../services/agent-registry.js";

const registerBodySchema = z.object({
  name: z.string().min(1).max(255).openapi({ example: "my-code-reviewer" }),
  description: z
    .string()
    .max(1000)
    .optional()
    .openapi({ example: "An agent that reviews code" }),
  platform: z
    .string()
    .max(100)
    .optional()
    .openapi({ example: "claude-code" }),
  capabilities: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const registerResponseSchema = z.object({
  agent_id: z.string().uuid(),
  name: z.string(),
  api_key: z.string(),
  public_key: z.string(),
  private_key: z.string(),
  owner_id: z.string().uuid(),
  endpoints: z.object({
    inbox: z.string().url(),
    delegate: z.string().url(),
    discover: z.string().url(),
    sync: z.string().url(),
    capabilities: z.string().url(),
    profile: z.string().url(),
  }),
  polling_interval_seconds: z.number(),
  setup_instructions: z.array(z.string()),
  capabilities_template: z.object({
    namespace: z.string(),
    actions: z.array(z.string()),
    pricing: z.object({
      amount_microcents: z.number(),
      model: z.string(),
    }),
  }),
});

const agentRegisterRoute = createRoute({
  method: "post",
  path: "/api/v1/register",
  tags: ["Agent Registry"],
  summary: "Register a new agent (returns onboarding manifest)",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: registerBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: registerResponseSchema,
        },
      },
      description: "Agent registered with full onboarding manifest",
    },
  },
});

export function registerAgentRoutes(app: OpenAPIHono<AppEnv>) {
  // Apply owner auth middleware
  app.use("/api/v1/register", requireAuth("owner"));

  app.openapi(agentRegisterRoute, async (c) => {
    const auth = c.get("auth") as AuthOwner;
    const body = c.req.valid("json");

    const manifest = await registerAgent(auth.ownerId, {
      name: body.name,
      description: body.description,
      platform: body.platform,
      capabilities: body.capabilities,
      metadata: body.metadata,
    });

    return c.json(manifest, 201);
  });
}
