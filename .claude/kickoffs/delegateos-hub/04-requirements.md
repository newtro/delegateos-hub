---
phase: 4
phase_name: "Requirements"
status: "complete"
started: "2026-03-18T21:15:00Z"
completed: "2026-03-18T21:30:00Z"
---

## Requirements

### MoSCoW Prioritization

#### MUST Have (v1 PoC)
1. **Owner registration** - POST /api/v1/owners/register (email + name + org -> owner_id + api_key)
2. **Agent registration** - POST /api/v1/register (authenticated, returns full onboarding manifest with keypair)
3. **Agent CRUD** - GET/PATCH/DELETE /api/v1/agents/:id
4. **Capability manifest update** - POST /api/v1/agents/:id/capabilities
5. **Discovery endpoint** - GET /api/v1/discover (search by capability, org, tier, pricing)
6. **Inbox polling** - GET /api/v1/agents/:id/inbox (Redis Streams XREADGROUP BLOCK)
7. **Delegation lifecycle** - POST submit, accept, reject, complete, revoke
8. **Trust tier resolution** - Same owner = Tier 1, trust relationship = Tier 2, unknown = Tier 3
9. **DLP scanning** - Synchronous, both directions, 50-100 patterns from secrets-patterns-db
10. **Daily sync** - GET /api/v1/network/sync (signed payload, Redis-cached)
11. **Health endpoint** - GET /health
12. **Docker compose** - PostgreSQL + Redis for local dev
13. **Zod validation** - Every endpoint validated via @hono/zod-openapi

#### SHOULD Have (v1)
14. **MCP server exposure** - 10 tools mapping to core API endpoints
15. **Settlement ledger** - Escrow create/release/refund, balance tracking, platform fee
16. **Landing page** - Bundled with API via serveStatic, human + agent readable
17. **API docs** - OpenAPI spec auto-generated, Scalar UI at /docs
18. **Rate limiting** - Token bucket per agent (10 tokens, 1/sec refill)
19. **Trust score persistence** - PostgreSQL-backed trust scores per agent per capability

#### COULD Have (v1)
20. **SSE inbox upgrade** - Optional real-time push for persistent agents
21. **Trust score analytics** - Aggregate stats, leaderboards
22. **Webhook notifications** - Owner notifications for DLP blocks, high-value delegations
23. **Blocked message audit log** - Queryable history of DLP blocks

#### WON'T Have (v1)
- Stripe/payment processor integration
- WebSocket connections
- Admin dashboard UI
- Multi-region deployment
- Agent-to-agent streaming
- Email verification flow (manual/seeded for PoC)
- OAuth 2.0 / SSO (API key only for v1)

### Non-Functional Requirements
- **Latency**: < 500ms p95 for inbox polling endpoint
- **Scale**: 50-200 concurrent agents
- **Availability**: Single-node, no HA requirement for PoC
- **Security**: Argon2id for API key hashing, Ed25519 for DCT signing, DLP on all messages
- **Auditability**: Structured JSON logging for all delegation events
- **Data integrity**: Transactional DB operations for settlement, multi-table writes
- **Timestamps**: ISO 8601 everywhere
- **Monetary values**: Microcents (integer), never floating point

### Key Design Decisions
- Owner registration is separate from agent registration (Stripe/Twilio pattern)
- Hub generates Ed25519 keypairs for agents (simplifies onboarding)
- DLP scans both directions (delegation requests AND responses/completions)
- Trust is between owners, not agents (human relationship model)
