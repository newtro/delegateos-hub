import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";

const healthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  version: z.string(),
  uptime: z.number(),
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Health check",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: healthResponseSchema,
        },
      },
      description: "Service is healthy",
    },
  },
});

export function registerHealthRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(healthRoute, (c) => {
    return c.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
        uptime: process.uptime(),
      },
      200
    );
  });
}
