---
phase: 3
phase_name: "Research Sprint"
status: "complete"
started: "2026-03-18T20:45:00Z"
completed: "2026-03-18T21:15:00Z"
research_scores:
  core_tech_stack: 7
  dlp_scanning: 7
  flyio_deployment: 8
  hono_zod_openapi: 8
  agent_messaging: 8
  competitive_landscape: 8
---

## Research Sprint Summary

### Core Tech Stack
- Drizzle ORM v0.45.1: Pre-1.0 but solid PG support. Transactions, JSONB, UUID all work. Watch for v1 breaking changes.
- BullMQ v5.71.0: Use for background job processing (DLP scanning, settlement). Requires Redis 6.2+ with noeviction policy.
- MCP SDK v1.27.1: Use v1.x for production. v2 in development.
- Argon2id: OWASP #1 recommendation. Use `argon2` npm package v0.44.0.

### DLP / Secret Scanning
- No dominant Node.js DLP library. Hand-roll scanner using curated patterns from `secrets-patterns-db`.
- Entropy threshold: 4.5 for base64, exclude UUIDs and known hash formats.
- PII detection: `@redactpii/node` for fast regex-based PII scanning.
- Start with 50-100 high-confidence patterns, not full 1,600.

### Fly.io Deployment
- Managed PG: ~$38/mo (includes PgBouncer, HA, backups)
- Upstash Redis: ~$10/mo fixed plan (MUST use fixed plan for BullMQ, not PAYG)
- Process groups: web + worker in single fly.toml, scaled independently
- Secrets: encrypted vault, injected as env vars
- Total minimum: ~$55/mo

### Hono + Zod + OpenAPI
- Use `@hono/zod-openapi` for combined validation and OpenAPI doc generation
- Use `@scalar/hono-api-reference` for interactive API docs UI
- `serveStatic` from `@hono/node-server/serve-static` for landing page
- Test with `app.request()` in Vitest
- `defaultHook` for global validation error handling

### Agent Messaging Architecture
- Redis Streams for inbox (not BullMQ): XREADGROUP BLOCK for long-polling, consumer groups for delivery tracking
- At-least-once delivery with idempotent processing (delegation_id dedup)
- Token bucket rate limiting: 10 tokens, refill 1/sec per agent
- Optional SSE upgrade for persistent agents (aligns with Google A2A)
- BullMQ reserved for async background jobs only

### Competitive Landscape
- No competitor combines: crypto delegation tokens + trust tiers + economic settlement + DLP scanning
- CrewAI: intra-crew delegation only, no cross-org marketplace
- AutoGen/Microsoft Agent Framework: orchestration primitives, no marketplace or economic layer
- LangGraph: workflow engine, no trust or settlement
- Google A2A: protocol only, not a platform. AP2 for payments is separate and early.
- DelegateOS's unique position: trust + economics + policy infrastructure layer

### Key Decisions from Research
1. Redis Streams for inbox messaging (BullMQ for background jobs only)
2. @hono/zod-openapi for combined validation + OpenAPI generation
3. Scalar for API docs UI
4. Argon2id for API key hashing
5. Hand-rolled DLP scanner from secrets-patterns-db
6. Fly.io process groups (web + worker)
7. Upstash Redis fixed plan (not PAYG)
