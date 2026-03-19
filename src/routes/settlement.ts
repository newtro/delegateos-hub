import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";
import { requireAuth, type AuthOwner } from "../middleware/auth.js";
import { getOwnerBalance, depositFunds } from "../services/settlement.js";
import { ForbiddenError } from "../utils/errors.js";

const balanceResponseSchema = z.object({
  owner_id: z.string().uuid(),
  balance_microcents: z.number(),
  available_microcents: z.number(),
  held_in_escrow_microcents: z.number(),
  total_earned_microcents: z.number(),
  total_spent_microcents: z.number(),
});

// GET /api/v1/owners/:id/balance
const getBalanceRoute = createRoute({
  method: "get",
  path: "/api/v1/owners/{id}/balance",
  tags: ["Settlement"],
  summary: "Get owner balance",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: balanceResponseSchema },
      },
      description: "Owner balance details",
    },
  },
});

// POST /api/v1/owners/:id/deposit
const depositRoute = createRoute({
  method: "post",
  path: "/api/v1/owners/{id}/deposit",
  tags: ["Settlement"],
  summary: "Deposit funds",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            amount_microcents: z
              .number()
              .int()
              .positive()
              .openapi({ example: 10000000 }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
            balance: balanceResponseSchema,
          }),
        },
      },
      description: "Deposit successful",
    },
  },
});

export function registerSettlementRoutes(app: OpenAPIHono<AppEnv>) {
  app.use("/api/v1/owners/*/balance", requireAuth("owner"));
  app.use("/api/v1/owners/*/deposit", requireAuth("owner"));

  app.openapi(getBalanceRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthOwner;

    if (auth.ownerId !== id) {
      throw new ForbiddenError("You can only view your own balance");
    }

    const balance = await getOwnerBalance(id);
    return c.json(balance, 200);
  });

  app.openapi(depositRoute, async (c) => {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") as AuthOwner;
    const body = c.req.valid("json");

    if (auth.ownerId !== id) {
      throw new ForbiddenError("You can only deposit to your own account");
    }

    await depositFunds(id, body.amount_microcents);
    const balance = await getOwnerBalance(id);

    return c.json({ message: "Deposit successful", balance }, 200);
  });
}
