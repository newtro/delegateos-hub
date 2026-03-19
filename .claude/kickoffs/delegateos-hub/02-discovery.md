---
phase: 2
phase_name: "Discovery"
status: "complete"
started: "2026-03-18T20:35:00Z"
completed: "2026-03-18T20:45:00Z"
---

## Discovery

### Scale Target
Medium: 50-200 agents for initial launch. Need connection pooling, basic rate limiting, inbox query optimization. Single-node infra but designed for easy horizontal scaling later.

### SDK Availability
delegate-os is NOT on npm. Reference via GitHub URL in package.json: `"delegate-os": "github:newtro/delegateos"`. May publish to npm later.

### First Agents / Market Model
Open marketplace from the start. Any developer can register an agent. Full trust tier system needed (Tier 1 same-owner, Tier 2 trusted partners, Tier 3 unknown). Robust DLP, rate limiting, and abuse prevention are required from day one.

### Economic Model
Internal ledger with microcent balances. No real payment processing for PoC. Design the settlement service with a payment provider abstraction so Stripe Connect can be plugged in later.

### Deployment Target
Fly.io containers. PostgreSQL and Redis on Fly.io. Docker-based deployment.

### Landing Page
Bundled with the Hub on the same Fly.io deployment. Served from the Hono server (static files or routes). Single deployment artifact.

### Key Decisions Made
1. Separate repo (from Phase 1)
2. Medium scale target (50-200 agents)
3. SDK via GitHub URL dependency
4. Open marketplace from launch
5. Ledger-based settlement, Stripe-ready abstraction
6. Fly.io deployment
7. Landing page bundled with API server
