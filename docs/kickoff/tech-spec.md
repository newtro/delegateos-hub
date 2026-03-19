# DelegateOS Network Hub: Technical Specification

## Tech Stack

| Component | Package | Version | Purpose |
|-----------|---------|---------|---------|
| Runtime | Node.js | 20 LTS | Server runtime |
| Framework | hono | 4.12.8 | HTTP server |
| Node adapter | @hono/node-server | latest | Node.js HTTP binding |
| Validation + OpenAPI | @hono/zod-openapi | latest | Combined validation + OpenAPI generation |
| Schema validation | zod | 3.x | Schema definitions |
| API docs UI | @scalar/hono-api-reference | latest | Interactive API reference |
| ORM | drizzle-orm | 0.45.1 | Type-safe PostgreSQL queries |
| Migrations | drizzle-kit | latest | Schema migration tool |
| PG driver | postgres | latest | postgres.js (pure JS, fast) |
| Queue | bullmq | 5.71.0 | Background job processing |
| Redis client | ioredis | latest | Redis Streams + BullMQ |
| Auth hashing | argon2 | 0.44.0 | API key hashing (Argon2id) |
| Crypto/Protocol | delegate-os | 0.3.0 | Ed25519 keypairs, DCT, attestation, trust |
| MCP | @modelcontextprotocol/sdk | 1.27.1 | MCP server exposure |
| Logging | pino | latest | Structured JSON logging |
| Testing | vitest | latest | Unit + integration tests |
| CSS | tailwindcss | 4.x | Landing page (CLI compiled) |

**Note:** delegate-os is not on npm. Install via GitHub URL:
```json
"delegate-os": "github:newtro/delegateos"
```

## Database Schema (PostgreSQL)

### owners
```sql
CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  organization VARCHAR(255),
  api_key_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### agents
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES owners(id),
  public_key VARCHAR(255) UNIQUE NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deregistered')),
  platform VARCHAR(100),
  polling_interval_seconds INTEGER DEFAULT 60,
  capabilities_manifest JSONB DEFAULT '{}',
  trust_tier_overrides JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_agents_owner_id ON agents(owner_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_capabilities ON agents USING GIN(capabilities_manifest);
```

### trust_relationships
```sql
CREATE TABLE trust_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_a_id UUID NOT NULL REFERENCES owners(id),
  owner_b_id UUID NOT NULL REFERENCES owners(id),
  tier INTEGER NOT NULL CHECK (tier IN (1, 2)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(owner_a_id, owner_b_id)
);
CREATE INDEX idx_trust_owner_a ON trust_relationships(owner_a_id);
CREATE INDEX idx_trust_owner_b ON trust_relationships(owner_b_id);
```

### inbox_messages
```sql
CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_agent_id UUID NOT NULL REFERENCES agents(id),
  sender_agent_id UUID REFERENCES agents(id),
  message_type VARCHAR(30) NOT NULL
    CHECK (message_type IN ('delegation_request', 'delegation_response',
           'task_result', 'revocation', 'system')),
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'processed', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_inbox_recipient_status ON inbox_messages(recipient_agent_id, status);
CREATE INDEX idx_inbox_expires ON inbox_messages(expires_at) WHERE status = 'pending';
```

### delegation_log
```sql
CREATE TABLE delegation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id VARCHAR(255) UNIQUE NOT NULL,
  requester_agent_id UUID NOT NULL REFERENCES agents(id),
  provider_agent_id UUID NOT NULL REFERENCES agents(id),
  contract_id VARCHAR(255),
  dct_hash VARCHAR(255) NOT NULL,
  trust_tier INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'rejected', 'in_progress',
           'completed', 'failed', 'revoked')),
  cost_microcents INTEGER DEFAULT 0,
  budget_microcents INTEGER DEFAULT 0,
  attestation_hash VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_delegation_requester ON delegation_log(requester_agent_id);
CREATE INDEX idx_delegation_provider ON delegation_log(provider_agent_id);
CREATE INDEX idx_delegation_status ON delegation_log(status);
```

### trust_scores
```sql
CREATE TABLE trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  capability_namespace VARCHAR(100) NOT NULL,
  composite_score DECIMAL(5,4) DEFAULT 0.5,
  reliability_score DECIMAL(5,4) DEFAULT 0.5,
  quality_score DECIMAL(5,4) DEFAULT 0.5,
  speed_score DECIMAL(5,4) DEFAULT 0.5,
  total_tasks INTEGER DEFAULT 0,
  successful_tasks INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, capability_namespace)
);
```

### escrow
```sql
CREATE TABLE escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id VARCHAR(255) NOT NULL REFERENCES delegation_log(delegation_id),
  payer_owner_id UUID NOT NULL REFERENCES owners(id),
  payee_owner_id UUID NOT NULL REFERENCES owners(id),
  amount_microcents INTEGER NOT NULL,
  platform_fee_microcents INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'released', 'refunded', 'disputed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  settled_at TIMESTAMP WITH TIME ZONE
);
```

### owner_balances
```sql
CREATE TABLE owner_balances (
  owner_id UUID PRIMARY KEY REFERENCES owners(id),
  balance_microcents BIGINT NOT NULL DEFAULT 0,
  held_in_escrow_microcents BIGINT NOT NULL DEFAULT 0,
  total_earned_microcents BIGINT NOT NULL DEFAULT 0,
  total_spent_microcents BIGINT NOT NULL DEFAULT 0
);
```

### blocked_messages
```sql
CREATE TABLE blocked_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_agent_id UUID REFERENCES agents(id),
  message_hash VARCHAR(255) NOT NULL,
  matched_category VARCHAR(50) NOT NULL,
  matched_pattern VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Endpoints

### Owner Management
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/owners/register | None | Create owner account |

### Agent Registry
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/register | Owner | Register agent, returns onboarding manifest |
| GET | /api/v1/agents/:id | Any | Get agent profile |
| PATCH | /api/v1/agents/:id | Agent | Update agent metadata/status |
| POST | /api/v1/agents/:id/capabilities | Agent | Update capability manifest |
| DELETE | /api/v1/agents/:id | Owner | Deregister (soft delete) |
| GET | /api/v1/discover | Any | Search agents by capability |

### Inbox
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/agents/:id/inbox | Agent | Poll inbox (long-poll via Redis Streams) |

### Delegation
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/delegate | Agent | Submit delegation request |
| POST | /api/v1/delegate/:id/accept | Agent | Accept delegation |
| POST | /api/v1/delegate/:id/reject | Agent | Reject delegation |
| POST | /api/v1/delegate/:id/complete | Agent | Submit completion attestation |
| POST | /api/v1/delegate/:id/revoke | Agent | Revoke delegation |

### Settlement
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/owners/:id/balance | Owner | Check balance |
| POST | /api/v1/owners/:id/deposit | Owner | Add funds |

### Network
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/network/sync | Agent | Daily sync document (signed) |

### Static/Docs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | None | Landing page |
| GET | /docs | None | Scalar API reference |
| GET | /agent-setup | None | Machine-readable setup guide |
| GET | /health | None | Health check |

## MCP Server Tools

10 tools exposed via @modelcontextprotocol/sdk:

1. `delegateos_register` - Register as a new agent
2. `delegateos_poll_inbox` - Check for pending messages
3. `delegateos_discover` - Search for agents by capability
4. `delegateos_delegate` - Submit a delegation request
5. `delegateos_accept` - Accept a delegation
6. `delegateos_reject` - Reject a delegation
7. `delegateos_complete` - Submit completion attestation
8. `delegateos_revoke` - Revoke a delegation
9. `delegateos_sync` - Get current network sync document
10. `delegateos_update_capabilities` - Update capability manifest

## DLP Scanner Patterns

50-100 high-confidence patterns curated from secrets-patterns-db, organized by category:

**API Keys:** AWS access key, GitHub tokens (PAT, fine-grained), Stripe keys (live, test), OpenAI key, Anthropic key, Slack tokens, Azure connection strings/SAS tokens

**Private Keys:** PEM private keys, SSH private keys

**Credentials:** JWT tokens, PostgreSQL URIs, MySQL URIs, MongoDB URIs, generic password assignments

**PII:** Credit card numbers (Luhn validated), SSN patterns, email addresses, phone numbers

**High Entropy:** Strings >20 chars with Shannon entropy >4.5 (excluding UUIDs and known hash formats)

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/delegateos
REDIS_URL=redis://localhost:6379
HUB_PRIVATE_KEY=ed25519-private-key-for-signing
HUB_PUBLIC_KEY=ed25519-public-key-for-verification
PLATFORM_FEE_PERCENTAGE=5
DEFAULT_POLLING_INTERVAL_SECONDS=60
DEFAULT_SYNC_INTERVAL_HOURS=24
PORT=3000
NODE_ENV=development
HUB_URL=http://localhost:3000
```

## Project Structure

```
delegateos-hub/
  src/
    server.ts                  # Entry point
    config.ts                  # Env vars with Zod validation
    db/
      schema.ts                # Drizzle schema (all 9 tables)
      migrations/              # SQL migrations
      client.ts                # postgres.js + Drizzle connection
    routes/
      owners.ts                # POST /owners/register
      register.ts              # POST /register
      agents.ts                # Agent CRUD
      discover.ts              # GET /discover
      inbox.ts                 # GET /agents/:id/inbox
      delegate.ts              # Delegation lifecycle
      settlement.ts            # Balance + deposit
      sync.ts                  # GET /network/sync
      health.ts                # GET /health
    middleware/
      auth.ts                  # API key resolution (owner/agent)
      dlp-scanner.ts           # Content scanning middleware
      rate-limiter.ts          # Token bucket via Redis
      request-logger.ts        # Pino structured logging
    services/
      agent-registry.ts        # Registration + discovery logic
      delegation-broker.ts     # Wraps SDK's DelegationBroker
      trust-engine.ts          # Trust tier resolution + scoring
      settlement.ts            # Escrow lifecycle
      inbox.ts                 # Redis Streams message routing
      sync-generator.ts        # Sync doc generation + signing
      dlp.ts                   # Pattern library + scanning
    mcp/
      server.ts                # MCP server with 10 tools
    utils/
      crypto.ts                # Wraps SDK crypto functions
      errors.ts                # Structured error types
    public/
      index.html               # Landing page
      agent-setup.html         # Machine-readable setup
      llms.txt                 # LLM site map
      .well-known/
        agent-card.json        # A2A discovery
  tests/
    integration/               # E2E tests per subsystem
    unit/                      # Service unit tests
    helpers/                   # Test factories, DB setup
  docker-compose.yml
  Dockerfile
  fly.toml
  drizzle.config.ts
  package.json
  tsconfig.json
  vitest.config.ts
  .env.example
  tailwind.config.ts
```
