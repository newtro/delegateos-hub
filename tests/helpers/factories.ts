import { app } from "../../src/server.js";

/**
 * Test helper: make a request to the Hono app without starting the server.
 */
export async function request(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<Response> {
  const url = `http://localhost${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  };

  if (options?.body) {
    init.body = JSON.stringify(options.body);
  }

  return app.request(url, init);
}

/**
 * Register a test owner and return the owner_id and api_key.
 */
export async function createTestOwner(
  overrides?: { email?: string; name?: string; organization?: string }
): Promise<{ owner_id: string; api_key: string }> {
  const email = overrides?.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const res = await request("POST", "/api/v1/owners/register", {
    body: {
      email,
      name: overrides?.name ?? "Test Owner",
      organization: overrides?.organization ?? "Test Org",
    },
  });

  if (res.status !== 201) {
    const body = await res.json();
    throw new Error(`Failed to create test owner: ${JSON.stringify(body)}`);
  }

  const body = await res.json();
  return { owner_id: body.owner_id, api_key: body.api_key };
}

/**
 * Register a test agent under the given owner.
 */
export async function createTestAgent(
  ownerApiKey: string,
  overrides?: { name?: string; capabilities?: Record<string, unknown> }
): Promise<{
  agent_id: string;
  api_key: string;
  public_key: string;
  private_key: string;
}> {
  const res = await request("POST", "/api/v1/register", {
    headers: { Authorization: `Bearer ${ownerApiKey}` },
    body: {
      name: overrides?.name ?? `test-agent-${Date.now()}`,
      description: "Test agent",
      platform: "vitest",
      capabilities: overrides?.capabilities ?? {
        "test.capability": {
          actions: ["execute"],
          pricing: { amount_microcents: 10000, model: "per_task" },
        },
      },
    },
  });

  if (res.status !== 201) {
    const body = await res.json();
    throw new Error(`Failed to create test agent: ${JSON.stringify(body)}`);
  }

  const body = await res.json();
  return {
    agent_id: body.agent_id,
    api_key: body.api_key,
    public_key: body.public_key,
    private_key: body.private_key,
  };
}
