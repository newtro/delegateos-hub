---
project: "DelegateOS Network Hub"
slug: "delegateos-hub"
phase: 5
phase_name: "Workflows & Use Cases"
started: "2026-03-18T20:30:00Z"
last_updated: "2026-03-18T20:45:00Z"
brownfield: false
---

# DelegateOS Network Hub -- Kickoff Progress

## Phase Status
| # | Phase | Status | Score |
|---|-------|--------|-------|
| 1 | Seed | complete | -- |
| 2 | Discovery | complete | -- |
| 3 | Research Sprint | complete | 7.7 avg |
| 4 | Requirements | complete | -- |
| 5 | Workflows & Use Cases | complete | -- |
| 6 | UI & Experience Design | complete | -- |
| 7 | Technical Design | complete | -- |
| 8 | Expansion | complete | -- |
| 9 | Implementation Planning | complete | -- |
| 10 | Crystallize | complete | -- |

## Decision Log
| # | Decision | Rationale | Alternatives Considered | Phase |
|---|----------|-----------|------------------------|-------|
| 1 | Separate repo for Hub | Clean separation: SDK is a library, Hub is a service. Independent versioning, CI/CD, deployment. Standard pattern for library + hosted service. | Monorepo subdirectory (rejected: tighter coupling, shared CI complexity) | 1 |
| 2 | Medium scale target (50-200 agents) | Open marketplace needs room to grow, but no need for distributed infra complexity on day one. Single-node with pooling and rate limiting. | Small PoC (too limited for marketplace), Production-ready 500+ (premature optimization) | 2 |
| 3 | SDK via GitHub URL | Not published on npm yet. GitHub reference works for development. Can switch to npm later. | npm install (not available), local path (fragile) | 2 |
| 4 | Open marketplace from launch | Full trust tier system, DLP, rate limiting, abuse prevention needed from day one. | Own agents only (too limited), Partner agents (delays marketplace launch) | 2 |
| 5 | Ledger-based settlement, Stripe-ready | Internal microcent ledger for PoC. Payment provider abstraction for future Stripe Connect integration. | Stripe from day one (over-complex), No economic layer (loses key differentiator) | 2 |
| 6 | Fly.io deployment | Good balance of simplicity, global distribution potential, and container support. Built-in PostgreSQL and Redis. | Azure Container Apps (heavier), Railway (less control) | 2 |
| 7 | Landing page bundled with API | Single deployment artifact. Served from Hono. Simplest ops. | Separate static site (unnecessary complexity for PoC), Defer (need onboarding surface) | 2 |
| 8 | Redis Streams for inbox messaging | Durability, consumer groups, acknowledgment built-in. XREADGROUP BLOCK for long-polling. BullMQ reserved for background jobs. | BullMQ for inbox (overkill, loses Stream primitives), Redis Pub/Sub (fire-and-forget, no durability) | 3 |
| 9 | @hono/zod-openapi for validation + docs | Single source of truth for Zod schemas and OpenAPI spec. Eliminates schema duplication. | Separate @hono/zod-validator + manual OpenAPI (duplicated schemas) | 3 |
| 10 | Scalar for API docs UI | Modern interface, Hono integration via @scalar/hono-api-reference. | SwaggerUI (dated), Redoc (less interactive) | 3 |
| 11 | Argon2id for API key hashing | OWASP #1 recommendation for 2026. Better resistance to GPU/ASIC attacks than bcrypt. | bcrypt (still acceptable, but older standard) | 3 |
| 12 | Hand-rolled DLP scanner | No dominant Node.js DLP library. Curate 50-100 patterns from secrets-patterns-db. | detect-secrets-js (low adoption, security concerns), external subprocess (latency) | 3 |
| 13 | Separate owner registration (two-step) | Universal pattern across Stripe, Twilio, CrewAI. Owner is billing/audit anchor. Supports multi-agent ownership. | Inline auto-create (conflates one-time + repeated actions), Manual seeding (doesn't scale) | 4 |
| 14 | Hub generates Ed25519 keypairs | Simpler onboarding. Hub momentarily handles private key but returns it only once. | Agent brings own key (harder onboarding), Support both (complexity) | 4 |
| 15 | DLP scans both directions | Maximum security. Scan delegation requests AND responses/completions. ~10-50ms overhead per message within 500ms budget. | Outbound only (less secure), Async inbound (complexity) | 4 |
| 16 | Plain HTML + Tailwind for landing page | Zero framework. CLI-compiled CSS (~50KB). Maximum control over semantic markup and structured data. | Astro (overkill for one page), React (too heavy) | 6 |
| 17 | Dual-audience strategy | JSON-LD, /llms.txt, /.well-known/agent-card.json, semantic HTML. Both humans and AI agents served equally. | Human-only (misses key audience), separate sites (unnecessary) | 6 |
| 18 | postgres.js over pg | Modern, pure JS, 3-6x faster in benchmarks. No native bindings needed. Works with Drizzle postgres-js adapter. | pg/node-postgres (established but slower, needs native bindings for best perf) | 7 |
| 19 | Two API key types (owner + agent) | Clean separation of authorization scope. Owner keys for account ops, agent keys for runtime ops. Prefix-based routing. | Single key type (ambiguous scope), JWT tokens (over-complex for PoC) | 7 |

## Assumptions
| # | Assumption | Validated? | How to Validate | Phase |
|---|-----------|------------|-----------------|-------|
| 1 | delegate-os SDK v0.3.0 exports are stable enough to build on | Partially (374 tests pass, but pre-1.0) | Pin exact version, review SDK changelog before Hub releases | 1 |
| 2 | delegate-os is NOT on npm | Validated (user confirmed) | Will use GitHub URL reference | 2 |
| 3 | 50-200 agents is achievable on single-node PostgreSQL + Redis | Likely true | Load test with simulated agents | 2 |
| 4 | Fly.io supports the full stack (Node.js + PG + Redis) | Validated (research) | Managed PG ~$38/mo, Upstash Redis ~$10/mo, process groups for web+worker | 3 |
| 5 | Upstash Redis compatible with BullMQ | Validated with caveat | Must use fixed-price plan, not PAYG (BullMQ polling generates huge command counts) | 3 |

## Research Bibliography
### SDK Analysis
- DelegateOS GitHub repo: https://github.com/newtro/delegateos (v0.3.0, MIT license)
- Key dependencies: @noble/ed25519 ^2.0.0, @noble/hashes ^2.0.1, better-sqlite3 ^12.6.2

### Framework Research
- Hono v4.12.8: https://hono.dev/docs, https://www.npmjs.com/package/hono (~29.4k GitHub stars, ~6.5M weekly downloads)
- Hono vs Fastify comparison: https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/

### ORM & Queue Research
- Drizzle ORM v0.45.1: https://orm.drizzle.team/docs, https://www.npmjs.com/package/drizzle-orm (pre-1.0, v1 beta exists)
- BullMQ v5.71.0: https://docs.bullmq.io/, https://www.npmjs.com/package/bullmq (requires Redis 6.2+, maxmemory-policy=noeviction)
- @modelcontextprotocol/sdk v1.27.1: https://www.npmjs.com/package/@modelcontextprotocol/sdk (v2 in development, use v1.x for production)

### Auth Research
- Argon2id recommended over bcrypt for 2026 (OWASP #1): https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/
- argon2 npm package v0.44.0: https://www.npmjs.com/package/argon2
