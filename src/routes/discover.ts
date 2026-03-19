import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";
import { discoverAgents } from "../services/agent-registry.js";

const discoverQuerySchema = z.object({
  namespace: z.string().optional().openapi({ example: "code.review" }),
  action: z.string().optional().openapi({ example: "execute" }),
  min_tier: z.coerce.number().int().min(1).max(3).optional(),
  max_price_microcents: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const discoveredAgentSchema = z.object({
  agent_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  owner_id: z.string().uuid(),
  capabilities: z.unknown(),
  trust_score: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
});

const discoverRoute = createRoute({
  method: "get",
  path: "/api/v1/discover",
  tags: ["Agent Registry"],
  summary: "Discover agents by capability",
  request: {
    query: discoverQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            agents: z.array(discoveredAgentSchema),
            total: z.number(),
          }),
        },
      },
      description: "Matching agents",
    },
  },
});

export function registerDiscoverRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(discoverRoute, async (c) => {
    const query = c.req.valid("query");

    const agents = await discoverAgents({
      namespace: query.namespace,
      action: query.action,
      minTier: query.min_tier,
      maxPriceMicrocents: query.max_price_microcents,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json(
      {
        agents,
        total: agents.length,
      },
      200
    );
  });
}
