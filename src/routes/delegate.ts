import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";
import { requireAuth, type AuthAgent } from "../middleware/auth.js";
import {
  submitDelegation,
  acceptDelegation,
  rejectDelegation,
  completeDelegation,
  revokeDelegation,
} from "../services/delegation-broker.js";

const delegationResponseSchema = z.object({
  delegation_id: z.string(),
  status: z.string(),
  trust_tier: z.number(),
  requester_agent_id: z.string().uuid(),
  provider_agent_id: z.string().uuid(),
  created_at: z.string(),
});

const messageResponseSchema = z.object({
  message: z.string(),
  delegation_id: z.string(),
});

// POST /api/v1/delegate
const submitRoute = createRoute({
  method: "post",
  path: "/api/v1/delegate",
  tags: ["Delegation"],
  summary: "Submit a delegation request",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            provider_agent_id: z.string().uuid(),
            dct: z.string().min(1),
            contract_id: z.string().optional(),
            budget_microcents: z.number().int().nonnegative().optional(),
            metadata: z.record(z.unknown()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: delegationResponseSchema },
      },
      description: "Delegation request submitted",
    },
  },
});

// POST /api/v1/delegate/:id/accept
const acceptRoute = createRoute({
  method: "post",
  path: "/api/v1/delegate/{id}/accept",
  tags: ["Delegation"],
  summary: "Accept a delegation",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: messageResponseSchema },
      },
      description: "Delegation accepted",
    },
  },
});

// POST /api/v1/delegate/:id/reject
const rejectRoute = createRoute({
  method: "post",
  path: "/api/v1/delegate/{id}/reject",
  tags: ["Delegation"],
  summary: "Reject a delegation",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: messageResponseSchema },
      },
      description: "Delegation rejected",
    },
  },
});

// POST /api/v1/delegate/:id/complete
const completeRoute = createRoute({
  method: "post",
  path: "/api/v1/delegate/{id}/complete",
  tags: ["Delegation"],
  summary: "Complete a delegation with result",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            result: z.record(z.unknown()),
            attestation_hash: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: messageResponseSchema },
      },
      description: "Delegation completed",
    },
  },
});

// POST /api/v1/delegate/:id/revoke
const revokeRoute = createRoute({
  method: "post",
  path: "/api/v1/delegate/{id}/revoke",
  tags: ["Delegation"],
  summary: "Revoke a delegation",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: messageResponseSchema },
      },
      description: "Delegation revoked",
    },
  },
});

export function registerDelegationRoutes(app: OpenAPIHono<AppEnv>) {
  // All delegation routes require agent auth
  app.use("/api/v1/delegate", requireAuth("agent"));
  app.use("/api/v1/delegate/*", requireAuth("agent"));

  // Submit delegation
  app.openapi(submitRoute, async (c) => {
    const auth = c.get("auth") as AuthAgent;
    const body = c.req.valid("json");

    const result = await submitDelegation({
      requesterAgentId: auth.agentId,
      providerAgentId: body.provider_agent_id,
      dct: body.dct,
      contractId: body.contract_id,
      budgetMicrocents: body.budget_microcents,
      metadata: body.metadata,
    });

    return c.json(result, 201);
  });

  // Accept delegation
  app.openapi(acceptRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthAgent;
    await acceptDelegation(id, auth.agentId);
    return c.json(
      { message: "Delegation accepted", delegation_id: id },
      200
    );
  });

  // Reject delegation
  app.openapi(rejectRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthAgent;
    const body = c.req.valid("json");
    await rejectDelegation(id, auth.agentId, body.reason);
    return c.json(
      { message: "Delegation rejected", delegation_id: id },
      200
    );
  });

  // Complete delegation
  app.openapi(completeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthAgent;
    const body = c.req.valid("json");
    await completeDelegation(id, auth.agentId, body.result, body.attestation_hash);
    return c.json(
      { message: "Delegation completed", delegation_id: id },
      200
    );
  });

  // Revoke delegation
  app.openapi(revokeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthAgent;
    const body = c.req.valid("json");
    await revokeDelegation(id, auth.agentId, body.reason);
    return c.json(
      { message: "Delegation revoked", delegation_id: id },
      200
    );
  });
}
