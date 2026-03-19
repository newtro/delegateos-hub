import { describe, it, expect } from "vitest";
import { scanContent, scanPayload } from "../../src/services/dlp.js";

// Build test keys at runtime to avoid GitHub push protection false positives.
// These are intentionally fake keys used to test the DLP scanner.
const FAKE_STRIPE_KEY = ["sk", "live", "51ABCDEFGHIJKLMNOPQRSTUVWx"].join("_");

describe("DLP Scanner", () => {
  describe("API Key detection", () => {
    it("should detect AWS access keys", () => {
      const result = scanContent("My key is AKIAIOSFODNN7EXAMPLE");
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.category).toBe("api_key");
      expect(result.matches[0]?.pattern).toBe("aws_access_key");
    });

    it("should detect GitHub PATs", () => {
      const result = scanContent("Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij");
      expect(result.blocked).toBe(true);
      const ghpMatch = result.matches.find((m) => m.pattern === "github_pat");
      expect(ghpMatch).toBeDefined();
    });

    it("should detect Stripe live keys", () => {
      const result = scanContent(FAKE_STRIPE_KEY);
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.pattern).toBe("stripe_live_key");
    });

    it("should detect Anthropic keys", () => {
      const result = scanContent(
        "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop"
      );
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.pattern).toBe("anthropic_key");
    });

    it("should detect OpenAI project keys", () => {
      const result = scanContent(
        "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop"
      );
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.pattern).toBe("openai_key_v2");
    });
  });

  describe("Private key detection", () => {
    it("should detect PEM private keys", () => {
      const result = scanContent("-----BEGIN RSA PRIVATE KEY-----\nMIIE...");
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.category).toBe("private_key");
    });

    it("should detect SSH private keys", () => {
      const result = scanContent("-----BEGIN OPENSSH PRIVATE KEY-----");
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.category).toBe("private_key");
    });
  });

  describe("Credential detection", () => {
    it("should detect JWT tokens", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = scanContent(jwt);
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.pattern).toBe("jwt_token");
    });

    it("should detect PostgreSQL URIs with credentials", () => {
      const result = scanContent(
        "postgresql://user:password123@prod-db.example.com:5432/mydb"
      );
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.pattern).toBe("postgresql_uri");
    });
  });

  describe("PII detection", () => {
    it("should detect credit card numbers with Luhn validation", () => {
      // Valid Visa test number
      const result = scanContent("Card: 4111111111111111");
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.pattern).toBe("credit_card");
    });

    it("should not flag invalid credit card numbers", () => {
      // Invalid Luhn
      const result = scanContent("Number: 4111111111111112");
      const ccMatch = result.matches.find((m) => m.pattern === "credit_card");
      expect(ccMatch).toBeUndefined();
    });

    it("should detect SSN patterns", () => {
      const result = scanContent("SSN: 123-45-6789");
      expect(result.blocked).toBe(true);
      expect(result.matches[0]?.pattern).toBe("ssn");
    });
  });

  describe("Clean content", () => {
    it("should not flag normal text", () => {
      const result = scanContent(
        "Please review this code and provide feedback on the implementation."
      );
      expect(result.blocked).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it("should not flag UUIDs", () => {
      const result = scanContent(
        "Agent ID: 550e8400-e29b-41d4-a716-446655440000"
      );
      // UUID should not trigger entropy check
      const entropyMatch = result.matches.find(
        (m) => m.category === "high_entropy"
      );
      expect(entropyMatch).toBeUndefined();
    });
  });

  describe("Payload scanning", () => {
    it("should scan JSON payloads recursively", () => {
      const result = scanPayload({
        task: "review",
        context: {
          config: FAKE_STRIPE_KEY,
        },
      });
      expect(result.blocked).toBe(true);
    });

    it("should pass clean payloads", () => {
      const result = scanPayload({
        task: "code review",
        files: ["main.ts", "utils.ts"],
        priority: "high",
      });
      expect(result.blocked).toBe(false);
    });
  });
});
