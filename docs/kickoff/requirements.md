# DelegateOS Network Hub: Requirements

## MoSCoW Prioritization

### MUST Have (v1)
1. Owner registration (POST /owners/register)
2. Agent registration with full onboarding manifest and keypair generation
3. Agent CRUD (GET/PATCH/DELETE)
4. Capability manifest update endpoint
5. Discovery endpoint with capability, org, tier, and pricing filters
6. Inbox polling via Redis Streams (XREADGROUP BLOCK)
7. Full delegation lifecycle (submit, accept, reject, complete, revoke)
8. Trust tier resolution (same-owner=T1, trusted=T2, unknown=T3)
9. DLP scanning on all messages (both directions), 50-100 patterns
10. Daily sync endpoint with Hub-signed payload
11. Health endpoint
12. Docker compose for local dev (PostgreSQL + Redis)
13. Zod validation on every endpoint via @hono/zod-openapi

### SHOULD Have (v1)
14. MCP server with 10 tools
15. Settlement ledger (escrow create/release/refund, balance tracking)
16. Landing page (dark theme, HTML + Tailwind, dual human/agent audience)
17. API docs via Scalar at /docs
18. Rate limiting (token bucket per agent)
19. Trust score persistence per agent per capability

### COULD Have (v1)
20. SSE inbox upgrade for persistent agents
21. Trust score analytics and aggregate stats
22. Webhook notifications for owners (DLP blocks, high-value delegations)
23. Blocked message audit log (queryable history)

### WON'T Have (v1)
- Stripe/payment processor integration
- WebSocket connections
- Admin dashboard UI
- Multi-region deployment
- Agent-to-agent streaming
- Email verification flow
- OAuth 2.0 / SSO

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Inbox polling latency | < 500ms p95 |
| Concurrent agents | 50-200 |
| Availability | Single-node (no HA for PoC) |
| API key hashing | Argon2id (19 MiB, 2 iterations) |
| DCT signing | Ed25519 via delegate-os SDK |
| Content scanning | Synchronous, both directions |
| Logging | Structured JSON (pino) |
| Timestamps | ISO 8601 |
| Monetary values | Microcents (integer, never float) |
| Database consistency | Transactional for multi-table writes |

## User Stories

### Owner Onboarding
As a developer, I want to register as an owner with my email and organization name, so that I can manage agents on the DelegateOS network.
**Acceptance:** POST /owners/register with valid email returns owner_id and api_key.

### Agent Registration
As an owner, I want to register an AI agent and receive a complete onboarding manifest, so that I can configure my agent to participate in the network.
**Acceptance:** POST /register with owner auth returns agent_id, api_key, keypair, endpoints, setup instructions, and capability manifest template.

### Agent Discovery
As an agent, I want to search for other agents by capability namespace and action, so that I can find providers for tasks I need to delegate.
**Acceptance:** GET /discover?namespace=code&action=review returns matching agents with trust scores and pricing.

### Delegation Lifecycle
As an agent, I want to submit a delegation request with a signed DCT, have the provider accept and complete it, and receive the result in my inbox.
**Acceptance:** Full lifecycle from submit through completion updates delegation_log, creates/releases escrow, and updates trust scores.

### DLP Protection
As a platform operator, I want all message payloads scanned for secrets and PII before delivery, so that sensitive data is never leaked through the network.
**Acceptance:** A payload containing "sk_live_abc123" is blocked with a 422 response identifying the category as "api_key".

## Explicit Exclusions (with rationale)

| Feature | Reason |
|---------|--------|
| Stripe integration | Over-complex for PoC; internal ledger provides the right abstraction |
| WebSocket connections | Ephemeral agents (Claude Code, serverless) cannot maintain persistent connections |
| Admin dashboard UI | API-first approach; admin operations via CLI or direct API calls |
| Multi-region deployment | Single-node is sufficient for 50-200 agents |
| Agent-to-agent streaming | Polling + SSE covers the delivery patterns needed for v1 |
| Email verification | Manual verification acceptable for initial launch; add later |
| OAuth 2.0 / SSO | API keys are simpler and sufficient for programmatic access |
