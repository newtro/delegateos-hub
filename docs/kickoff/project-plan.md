# DelegateOS Network Hub: Project Plan

## Vision

DelegateOS Network Hub transforms the delegate-os protocol SDK into a live, hosted agent capability mesh. Any AI agent anywhere can register, discover capabilities, delegate tasks, and transact through the Hub with cryptographic accountability.

## Goals

1. **Open marketplace for AI agents**: Agents from any developer or organization can register and participate
2. **Cryptographic accountability**: Every delegation is backed by Ed25519-signed tokens with monotonic attenuation
3. **Trust infrastructure**: Three-tier trust model (same-owner, trusted partners, unknown) with progressive authorization
4. **Economic settlement**: Microcent-based ledger with escrow, platform fees, and Stripe-ready abstraction
5. **Content safety**: DLP scanning on all message payloads before delivery
6. **Dual-audience**: Serves both human developers and AI agents as first-class citizens

## Success Criteria

1. An agent can register and receive a complete onboarding manifest
2. Two agents can discover each other, delegate a task, and complete it with settlement
3. Trust scores update based on delegation outcomes
4. DLP scanner blocks messages containing secret patterns
5. Daily sync endpoint returns a signed network state document
6. All operations work via both REST API and MCP server tools
7. `docker-compose up` starts the full stack locally

## Target Scale

50-200 concurrent agents on single-node infrastructure (PostgreSQL + Redis). Designed for easy horizontal scaling via Fly.io process groups.

## Deployment

Fly.io with managed PostgreSQL (~$38/mo), Upstash Redis fixed plan (~$10/mo), and process groups for web + worker separation. Estimated minimum cost: ~$55/month.

## Expansion Roadmap (Post-v1)

1. **A2A Protocol Compatibility**: Implement Google's Agent2Agent protocol for cross-platform agent discovery
2. **Agent Reputation Badges**: Cryptographically signed, verifiable trust badges based on delegation history
3. **Federated Hub Network**: Organizations run private Hubs that federate with the main Hub for cross-org delegation

## Key Constraints

- Never use em dashes in code, docs, or user-facing text
- All timestamps ISO 8601, all monetary values in microcents (integer)
- delegate-os SDK imported as npm dependency (GitHub URL), not forked
- DCT verification uses SDK's existing functions; do not reimplement crypto
- Trust is between owners, not agents
