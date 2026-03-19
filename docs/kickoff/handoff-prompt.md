# DelegateOS Network Hub: Implementation Handoff

Use this prompt to start a new implementation session. Paste it into Claude Code or any AI coding assistant.

---

```
You are implementing the DelegateOS Network Hub, a hosted service that wraps the delegate-os TypeScript SDK (github.com/newtro/delegateos) with a network layer for agent registration, delegation, and settlement.

## Project Context

Read these artifact files for full specifications:
- docs/kickoff/project-plan.md (vision, goals, constraints)
- docs/kickoff/architecture.md (system design, data flow, deployment)
- docs/kickoff/tech-spec.md (database schema, API endpoints, project structure)
- docs/kickoff/requirements.md (MoSCoW features, NFRs, user stories)
- docs/kickoff/implementation-roadmap.md (8 milestones, 62 tasks)
- docs/kickoff/risk-register.md (risks, mitigations, unvalidated assumptions)

## Tech Stack (Verified Versions)

- Runtime: Node.js 20 LTS
- Framework: hono 4.12.8 with @hono/node-server
- Validation + OpenAPI: @hono/zod-openapi (combines Zod validation + OpenAPI spec generation)
- API Docs: @scalar/hono-api-reference
- ORM: drizzle-orm 0.45.1 with postgres.js driver
- Migrations: drizzle-kit
- Queue: bullmq 5.71.0 (background jobs only; NOT for inbox)
- Redis: ioredis (Redis Streams for inbox via XREADGROUP BLOCK)
- Auth: argon2 0.44.0 (Argon2id for API key hashing)
- Protocol SDK: delegate-os 0.3.0 via "github:newtro/delegateos"
- MCP: @modelcontextprotocol/sdk 1.27.1
- Logging: pino
- Testing: vitest
- Landing page: plain HTML + Tailwind CSS 4.x (CLI compiled)

## Critical Rules

- Never use em dashes in code, docs, or user-facing text. Use commas, semicolons, colons, parentheses, or separate sentences.
- All database operations must be transactional where multiple tables are affected (especially settlement).
- Every API endpoint must validate input with Zod schemas via @hono/zod-openapi.
- DLP scanner must run BEFORE any message is delivered to any inbox. No exceptions. Scan both directions.
- DCT verification must use the SDK's existing verifyDCT(). Do not reimplement crypto.
- Trust tier resolution checks owners, not agents. Trust is between humans.
- Daily sync document must be signed with Hub's Ed25519 key.
- All timestamps ISO 8601. All monetary amounts in microcents (integer, never float).
- Import from delegate-os package. Do not copy SDK code.
- Two API key types: dos_owner_xxxx (owner ops) and dos_agent_xxxx (agent runtime ops).
- Redis Streams for inbox messaging. BullMQ for background jobs only.
- Argon2id for API key hashing (not bcrypt).

## Key Architecture Decisions

1. Separate repo from SDK (SDK imported as npm dependency via GitHub URL)
2. Redis Streams (XREADGROUP BLOCK) for inbox polling, not BullMQ
3. @hono/zod-openapi for combined validation + OpenAPI generation
4. Separate owner registration from agent registration (POST /owners/register then POST /register)
5. Hub generates Ed25519 keypairs for agents
6. DLP scans both directions (delegation requests AND responses)
7. Trust is between owners, not agents (owner_a trusts owner_b at tier N)
8. Internal microcent ledger with payment provider abstraction (Stripe-ready)
9. Fly.io deployment with process groups (web + worker)
10. Plain HTML + Tailwind for dual-audience landing page (humans + AI agents)

## Database Schema

9 tables: owners, agents, trust_relationships, inbox_messages, delegation_log, trust_scores, escrow, owner_balances, blocked_messages. Full DDL in docs/kickoff/tech-spec.md.

## Build Order

Start with Milestone 1 (Foundation): package.json, tsconfig, docker-compose, Drizzle config, database schema, Hono server with /health endpoint. Then proceed through milestones sequentially per the implementation roadmap.

## Deployment Target

Fly.io: Managed PostgreSQL (~$38/mo), Upstash Redis fixed plan (~$10/mo, MUST use fixed plan not PAYG for BullMQ compatibility), process groups for web + worker. docker-compose.yml for local dev.
```

---

This prompt contains everything needed to begin implementation. The artifact files provide the full detail.
