import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";
import { generateSyncDocument } from "../services/sync-generator.js";

const syncRoute = createRoute({
  method: "get",
  path: "/api/v1/network/sync",
  tags: ["Network"],
  summary: "Get signed network sync document",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            version: z.string(),
            generated_at: z.string(),
            hub_url: z.string(),
            hub_public_key: z.string(),
            network_stats: z.object({
              total_agents: z.number(),
              active_agents: z.number(),
              total_delegations: z.number(),
              completed_delegations: z.number(),
              total_namespaces: z.number(),
            }),
            policies: z.object({
              max_delegation_budget_microcents: z.number(),
              platform_fee_percentage: z.number(),
              default_polling_interval_seconds: z.number(),
              dlp_enabled: z.boolean(),
              trust_tiers: z.object({
                tier_1: z.string(),
                tier_2: z.string(),
                tier_3: z.string(),
              }),
            }),
            capability_taxonomy: z.array(z.string()),
            signature: z.string(),
          }),
        },
      },
      description: "Signed network sync document",
    },
  },
});

export function registerSyncRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(syncRoute, async (c) => {
    const doc = await generateSyncDocument();
    return c.json(doc, 200);
  });
}
