import { describe, it, expect } from "vitest";
import { request } from "../helpers/factories.js";

describe("Health endpoint", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await request("GET", "/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});
