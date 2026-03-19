import { describe, it, expect } from "vitest";
import { request, createTestOwner, createTestAgent } from "../helpers/factories.js";

describe("Agent registration and discovery", () => {
  it("registers an agent and returns onboarding manifest", async () => {
    const owner = await createTestOwner();
    const res = await request("POST", "/api/v1/register", {
      headers: { Authorization: `Bearer ${owner.api_key}` },
      body: {
        name: "my-test-agent",
        description: "A test agent",
        platform: "vitest",
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agent_id).toBeDefined();
    expect(body.api_key).toMatch(/^dos_agent_/);
    expect(body.public_key).toBeDefined();
    expect(body.private_key).toBeDefined();
    expect(body.endpoints).toBeDefined();
    expect(body.endpoints.inbox).toContain(body.agent_id);
    expect(body.setup_instructions).toBeInstanceOf(Array);
    expect(body.capabilities_template).toBeDefined();
  });

  it("GET /api/v1/agents/:id returns agent profile", async () => {
    const owner = await createTestOwner();
    const agent = await createTestAgent(owner.api_key);

    const res = await request("GET", `/api/v1/agents/${agent.agent_id}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.agent_id).toBe(agent.agent_id);
    expect(body.status).toBe("active");
  });

  it("GET /api/v1/discover returns active agents", async () => {
    const owner = await createTestOwner();
    await createTestAgent(owner.api_key, { name: "discoverable-agent" });

    const res = await request("GET", "/api/v1/discover");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.agents).toBeInstanceOf(Array);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("DELETE deregisters an agent (soft delete)", async () => {
    const owner = await createTestOwner();
    const agent = await createTestAgent(owner.api_key);

    const res = await request("DELETE", `/api/v1/agents/${agent.agent_id}`, {
      headers: { Authorization: `Bearer ${owner.api_key}` },
    });
    expect(res.status).toBe(200);

    // Verify the agent is now deregistered
    const getRes = await request("GET", `/api/v1/agents/${agent.agent_id}`);
    const body = await getRes.json();
    expect(body.status).toBe("deregistered");
  });

  it("rejects unauthenticated registration", async () => {
    const res = await request("POST", "/api/v1/register", {
      body: { name: "no-auth-agent" },
    });
    expect(res.status).toBe(401);
  });
});
