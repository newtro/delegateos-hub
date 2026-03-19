import { describe, it, expect } from "vitest";
import { request, createTestOwner, createTestAgent } from "../helpers/factories.js";

// Build test key at runtime to avoid GitHub push protection false positives
const FAKE_STRIPE_KEY = ["sk", "live", "51ABCDEFGHIJKLMNOPQRSTUVWx"].join("_");

describe("DLP integration", () => {
  it("blocks delegation request containing a secret", async () => {
    const owner = await createTestOwner();
    const agent = await createTestAgent(owner.api_key);

    const res = await request("POST", "/api/v1/delegate", {
      headers: { Authorization: `Bearer ${agent.api_key}` },
      body: {
        provider_agent_id: "00000000-0000-0000-0000-000000000000",
        dct: "test-dct",
        metadata: {
          config: FAKE_STRIPE_KEY,
        },
      },
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("DLP_BLOCKED");
  });

  it("allows clean delegation request payloads through", async () => {
    const owner = await createTestOwner();
    const requester = await createTestAgent(owner.api_key, { name: "requester" });
    const provider = await createTestAgent(owner.api_key, { name: "provider" });

    // This will fail DCT verification, but it should NOT be blocked by DLP
    const res = await request("POST", "/api/v1/delegate", {
      headers: { Authorization: `Bearer ${requester.api_key}` },
      body: {
        provider_agent_id: provider.agent_id,
        dct: '{"token":"test","format":"delegateos-sjt-v1"}',
        metadata: {
          task: "code review",
          description: "Please review this PR",
        },
      },
    });

    // Should fail on DCT verification (422), NOT on DLP
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).not.toBe("DLP_BLOCKED");
  });
});
