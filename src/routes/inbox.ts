import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";
import { requireAuth, type AuthAgent } from "../middleware/auth.js";
import { pollInbox } from "../services/inbox.js";
import { ForbiddenError } from "../utils/errors.js";

const inboxRoute = createRoute({
  method: "get",
  path: "/api/v1/agents/{id}/inbox",
  tags: ["Inbox"],
  summary: "Poll agent inbox (long-poll via Redis Streams)",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    query: z.object({
      timeout: z.coerce.number().int().min(1000).max(30000).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            messages: z.array(
              z.object({
                id: z.string(),
                stream_id: z.string(),
                message_type: z.string(),
                sender_agent_id: z.string().nullable(),
                payload: z.any(),
                created_at: z.string(),
              })
            ),
          }),
        },
      },
      description: "Inbox messages (may be empty if timeout reached)",
    },
  },
});

export function registerInboxRoutes(app: OpenAPIHono<AppEnv>) {
  app.use("/api/v1/agents/:id/inbox", requireAuth("agent"));

  app.openapi(inboxRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { timeout } = c.req.valid("query");
    const auth = c.get("auth") as AuthAgent;

    if (auth.agentId !== id) {
      throw new ForbiddenError("You can only poll your own inbox");
    }

    const messages = await pollInbox(id, timeout ?? 30000);

    return c.json({ messages }, 200);
  });
}
