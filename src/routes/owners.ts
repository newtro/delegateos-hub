import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";
import { db } from "../db/client.js";
import { owners, ownerBalances } from "../db/schema.js";
import { generateApiKey } from "../utils/crypto.js";
import { ConflictError } from "../utils/errors.js";

const ownerRegisterBodySchema = z.object({
  email: z.string().email().openapi({ example: "alice@example.com" }),
  name: z.string().min(1).max(255).openapi({ example: "Alice" }),
  organization: z
    .string()
    .max(255)
    .optional()
    .openapi({ example: "Acme Corp" }),
});

const ownerRegisterResponseSchema = z.object({
  owner_id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  organization: z.string().nullable(),
  api_key: z.string().openapi({
    description:
      "Your API key. Store it securely; it will not be shown again.",
  }),
  created_at: z.string(),
});

const registerOwnerRoute = createRoute({
  method: "post",
  path: "/api/v1/owners/register",
  tags: ["Owners"],
  summary: "Register a new owner account",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ownerRegisterBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: ownerRegisterResponseSchema,
        },
      },
      description: "Owner registered successfully",
    },
    409: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.object({
              code: z.string(),
              message: z.string(),
            }),
          }),
        },
      },
      description: "Email already registered",
    },
  },
});

export function registerOwnerRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(registerOwnerRoute, async (c) => {
    const body = c.req.valid("json");

    // Check for existing owner with same email
    const existing = await db.query.owners.findFirst({
      where: (o, { eq }) => eq(o.email, body.email),
    });
    if (existing) {
      throw new ConflictError("An owner with this email already exists");
    }

    const { rawKey, hash } = await generateApiKey("owner");

    const [owner] = await db
      .insert(owners)
      .values({
        email: body.email,
        name: body.name,
        organization: body.organization ?? null,
        apiKeyHash: hash,
      })
      .returning();

    // Create initial balance record
    await db.insert(ownerBalances).values({
      ownerId: owner!.id,
      balanceMicrocents: 0,
      heldInEscrowMicrocents: 0,
      totalEarnedMicrocents: 0,
      totalSpentMicrocents: 0,
    });

    return c.json(
      {
        owner_id: owner!.id,
        email: owner!.email,
        name: owner!.name,
        organization: owner!.organization,
        api_key: rawKey,
        created_at: owner!.createdAt!.toISOString(),
      },
      201
    );
  });
}
