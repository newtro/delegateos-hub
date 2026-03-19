# DelegateOS Network Hub: Implementation Roadmap

## Overview

8 milestones, 46 tasks. Each milestone produces a working, demo-able increment.

---

## Milestone 1: Foundation
**Demo: "docker-compose up, hit /health, get 200 OK"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 1 | Initialize repo: package.json, tsconfig.json (strict mode), .gitignore | None | Low |
| 2 | Install core dependencies: hono, @hono/node-server, @hono/zod-openapi, zod, drizzle-orm, postgres, ioredis, bullmq, argon2, pino, delegate-os (GitHub URL) | 1 | Medium (delegate-os GitHub install) |
| 3 | Create docker-compose.yml: PostgreSQL 16 + Redis 7 | None | Low |
| 4 | Create config.ts: env var loading with Zod validation | 2 | Low |
| 5 | Create db/client.ts: postgres.js connection + Drizzle instance | 2, 4 | Low |
| 6 | Create db/schema.ts: all 9 tables in Drizzle schema | 5 | Low |
| 7 | Create drizzle.config.ts + generate initial migration | 6 | Low |
| 8 | Create server.ts: Hono app with health endpoint + pino logger | 2, 4 | Low |
| 9 | Create .env.example with all env vars documented | 4 | Low |
| 10 | Verify: docker-compose up, run migration, GET /health returns 200 | All above | Low |

---

## Milestone 2: Agent Registry
**Demo: "Register an owner, register an agent, get onboarding manifest"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 11 | Create utils/crypto.ts: wrap SDK's generateKeypair(), API key generation with dos_owner_/dos_agent_ prefixes | M1 | Medium (SDK import compatibility) |
| 12 | Create middleware/auth.ts: Bearer token resolution, owner vs agent key types, Argon2id verification | M1 | Medium |
| 13 | Create routes/owners.ts: POST /owners/register (email, name, org -> owner_id + api_key) | 11, 12 | Low |
| 14 | Create services/agent-registry.ts: registration logic, onboarding manifest generation | 11 | Low |
| 15 | Create routes/register.ts: POST /register (owner auth -> full manifest) | 12, 14 | Low |
| 16 | Create routes/agents.ts: GET/:id, PATCH/:id, DELETE/:id, POST/:id/capabilities | 12 | Low |
| 17 | Create routes/discover.ts: GET /discover with namespace, action, tier, pricing filters | 16 | Low |
| 18 | Verify: register owner, register agent, discover agent | All above | Low |

---

## Milestone 3: Inbox + Delegation
**Demo: "Agent A delegates to Agent B, B accepts and completes"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 19 | Create services/inbox.ts: Redis Streams setup, XADD, XREADGROUP, XACK operations | M2 | Medium (Redis Streams patterns) |
| 20 | Create routes/inbox.ts: GET /agents/:id/inbox with XREADGROUP BLOCK 30000 | 19 | Medium |
| 21 | Create services/trust-engine.ts: trust tier resolution (owner lookup, relationship check) | M2 | Low |
| 22 | Create services/delegation-broker.ts: DCT verification, delegation routing, state management | 19, 21 | High (SDK integration) |
| 23 | Create routes/delegate.ts: POST /delegate, accept, reject, complete, revoke | 22 | Medium |
| 24 | Verify: full delegation lifecycle between two agents | All above | Medium |

---

## Milestone 4: DLP + Security
**Demo: "Submit a payload with sk_live_xxx, get blocked"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 25 | Create services/dlp.ts: pattern library (50-100 patterns), Luhn validator, entropy checker | M1 | Low |
| 26 | Create middleware/dlp-scanner.ts: scan payload before inbox delivery, return structured errors | 25 | Low |
| 27 | Integrate DLP into delegation submission (POST /delegate) | 23, 26 | Low |
| 28 | Integrate DLP into completion submission (POST /delegate/:id/complete) | 23, 26 | Low |
| 29 | Integrate DLP into capability manifest updates | 16, 26 | Low |
| 30 | Create middleware/rate-limiter.ts: token bucket per agent via Redis Lua scripts | M1 | Medium |
| 31 | Blocked message logging to blocked_messages table | 26 | Low |
| 32 | Verify: submit payload with secret pattern, confirm 422 block | All above | Low |

---

## Milestone 5: Settlement
**Demo: "Delegation completes, escrow releases, balances update"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 33 | Create services/settlement.ts: escrow create, release, refund (transactional) | M3 | Medium |
| 34 | Create routes/settlement.ts: GET /owners/:id/balance, POST /owners/:id/deposit | 33 | Low |
| 35 | Integrate escrow creation into delegation acceptance flow | 23, 33 | Medium |
| 36 | Integrate escrow release into delegation completion flow | 23, 33 | Medium |
| 37 | Integrate escrow refund into delegation revocation/failure | 23, 33 | Low |
| 38 | Platform fee calculation (configurable percentage, default 5%) | 33 | Low |
| 39 | Verify: full lifecycle with balance changes | All above | Medium |

---

## Milestone 6: Sync + MCP
**Demo: "GET /sync returns signed doc; MCP tools work"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 40 | Create services/sync-generator.ts: build sync document payload | M1 | Low |
| 41 | Hub Ed25519 key management: load from env, sign payloads | M1 | Low |
| 42 | Create routes/sync.ts: GET /network/sync with Redis caching | 40, 41 | Low |
| 43 | Trust score update logic: update scores on delegation completion | M3 | Medium |
| 44 | Create mcp/server.ts: MCP server with 10 tools mapping to API endpoints | M2-M5 | High (MCP SDK integration) |
| 45 | Verify: sync doc is valid and signed; MCP tools functional | All above | Medium |

---

## Milestone 7: Landing + Docs
**Demo: "Visit /, see landing page; visit /docs, see API reference"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 46 | Create public/index.html: dark theme landing page with Tailwind | M1 | Low |
| 47 | Create public/agent-setup.html: machine-readable registration guide | 46 | Low |
| 48 | Create public/llms.txt: LLM-friendly site map | 46 | Low |
| 49 | Create public/.well-known/agent-card.json: A2A discovery | 46 | Low |
| 50 | Integrate @scalar/hono-api-reference at /docs | M2 | Low |
| 51 | Compile Tailwind CSS via CLI for production | 46 | Low |
| 52 | Create Dockerfile (multi-stage build) | All | Low |
| 53 | Create fly.toml with process groups (web + worker) | 52 | Low |
| 54 | Verify: landing page renders, docs interactive, Dockerfile builds | All above | Low |

---

## Milestone 8: Integration Tests
**Demo: "Full lifecycle test passes end-to-end"**

| # | Task | Dependencies | Risk |
|---|------|-------------|------|
| 55 | Create test helpers: DB setup/teardown, agent/owner factories | M1 | Low |
| 56 | Test: owner + agent registration + discovery | M2, 55 | Low |
| 57 | Test: full delegation lifecycle (submit -> accept -> complete) | M3, 55 | Medium |
| 58 | Test: DLP blocks payload with secret pattern | M4, 55 | Low |
| 59 | Test: settlement flow (escrow create -> release with fee) | M5, 55 | Medium |
| 60 | Test: sync endpoint returns valid signed document | M6, 55 | Low |
| 61 | Test: MCP tools execute correctly | M6, 55 | Medium |
| 62 | Verify: all tests pass, CI-ready | All above | Low |

---

## Testing Strategy

- **Unit tests**: Services (DLP scanner, trust resolution, settlement logic)
- **Integration tests**: Full API endpoint testing via app.request() with real PostgreSQL + Redis
- **Test database**: Separate test database, migrated before each test suite, cleaned between tests
- **Test Redis**: Separate Redis database (SELECT 1) or test-prefixed keys

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| delegate-os SDK API changes | Medium | High | Pin exact commit hash, integration tests on SDK imports |
| Redis Streams learning curve | Low | Medium | Well-documented patterns; fallback to BullMQ if needed |
| Argon2id native compilation on Fly.io | Low | Medium | Use prebuilt binaries; fallback to @node-rs/argon2 |
| DLP false positives blocking legitimate traffic | Medium | Medium | Start with high-confidence patterns only; add allowlist mechanism |
| MCP SDK v1 deprecation during build | Low | Low | v1.x will receive fixes for 6+ months after v2 ships |
| Drizzle ORM breaking changes (pre-1.0) | Low | Medium | Pin exact version in package.json |
