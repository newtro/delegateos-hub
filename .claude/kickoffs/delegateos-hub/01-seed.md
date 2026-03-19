---
phase: 1
phase_name: "Seed"
status: "complete"
started: "2026-03-18T20:30:00Z"
completed: "2026-03-18T20:35:00Z"
---

## Seed

### Project Idea
Build the DelegateOS Network Hub: a hosted service layer that transforms the existing delegate-os TypeScript SDK into a live multi-agent capability mesh. Any AI agent can register, discover capabilities, delegate tasks, and transact through the Hub.

### Key Concept
The SDK provides the cryptographic and authorization engine (Ed25519-signed DCTs, contract verification, attestation chains, trust scoring, MCP middleware). The Hub provides the network infrastructure: registration, inbox routing, trust persistence, economic settlement, content scanning, and policy distribution.

### Repo Decision
Separate repository. Hub imports delegate-os as an npm dependency. Independent versioning, CI/CD, and deployment pipelines.

### Initial Research Completed
- SDK analysis: 23 test files, 374 passing tests, exports ~60+ functions/classes across crypto, DCT, contracts, attestation, trust, A2A, MCP, storage, transport
- Framework: Hono v4.12.8 (lightweight, multi-runtime, growing ecosystem)
- ORM: Drizzle v0.45.1 (type-safe PostgreSQL, good transaction support, pre-1.0)
- Queue: BullMQ v5.71.0 (Redis-backed, TypeScript-native, mature)
- MCP SDK: v1.27.1 (stable v1.x, v2 in development)
- Auth: Argon2id via argon2 npm package (OWASP #1 recommendation for 2026)
