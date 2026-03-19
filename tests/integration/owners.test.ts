import { describe, it, expect } from "vitest";
import { request, createTestOwner } from "../helpers/factories.js";

describe("Owner registration", () => {
  it("POST /api/v1/owners/register creates an owner", async () => {
    const res = await request("POST", "/api/v1/owners/register", {
      body: {
        email: `owner-${Date.now()}@test.com`,
        name: "Test Owner",
        organization: "Test Org",
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.owner_id).toBeDefined();
    expect(body.api_key).toMatch(/^dos_owner_/);
    expect(body.email).toContain("@test.com");
    expect(body.name).toBe("Test Owner");
  });

  it("rejects duplicate email", async () => {
    const email = `dup-${Date.now()}@test.com`;

    // First registration
    await request("POST", "/api/v1/owners/register", {
      body: { email, name: "Owner 1" },
    });

    // Duplicate
    const res = await request("POST", "/api/v1/owners/register", {
      body: { email, name: "Owner 2" },
    });

    expect(res.status).toBe(409);
  });

  it("validates email format", async () => {
    const res = await request("POST", "/api/v1/owners/register", {
      body: { email: "not-an-email", name: "Bad" },
    });

    expect(res.status).toBe(400);
  });
});
