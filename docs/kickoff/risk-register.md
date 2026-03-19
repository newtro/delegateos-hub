# DelegateOS Network Hub: Risk Register

## Technical Risks

| # | Risk | Likelihood | Impact | Mitigation | Contingency |
|---|------|-----------|--------|------------|-------------|
| 1 | delegate-os SDK API changes break Hub imports | Medium | High | Pin exact commit hash in package.json. Write integration tests that exercise every SDK function used. | Fork the SDK at the pinned version if upstream breaks compatibility |
| 2 | Redis Streams XREADGROUP behavior differs from documentation | Low | Medium | Build a small proof-of-concept with Redis Streams before committing to the full inbox implementation | Fall back to BullMQ queues for inbox (less elegant but functional) |
| 3 | Argon2id native module fails to compile on Fly.io | Low | Medium | Use prebuilt binaries (argon2 v0.26+ includes them). Test Docker build early. | Switch to @node-rs/argon2 (Rust bindings) or bcrypt as fallback |
| 4 | DLP scanner false positives block legitimate agent traffic | Medium | Medium | Start with only high-confidence patterns (50-100, not 1,600). Log all blocks for review. | Add per-agent allowlist for known-safe patterns. Add "warn" mode alongside "block" mode. |
| 5 | MCP SDK v1.27.1 deprecated before Hub launches | Low | Low | v1.x branch receives bug fixes for 6+ months after v2 ships. Monitor changelog. | Migrate to v2 when stable; breaking changes expected but manageable |
| 6 | Drizzle ORM breaking changes (pre-1.0 library) | Low | Medium | Pin exact version (0.45.1). Do not auto-update. Review changelog before any version bump. | Drizzle v1 beta exists; migrate if 0.x becomes unmaintained |
| 7 | Upstash Redis PAYG costs explode with BullMQ polling | High (if misconfigured) | High | Use fixed-price plan ($10/mo), NEVER pay-as-you-go. Document this in setup instructions. | Self-host Redis on a Fly Machine with persistent volume |

## Operational Risks

| # | Risk | Likelihood | Impact | Mitigation | Contingency |
|---|------|-----------|--------|------------|-------------|
| 8 | Abuse: mass-registration of fake agents | Medium | Medium | Rate limit owner registration (1 per email). Rate limit agent registration (10 per owner per hour). | Suspend owner accounts on abuse detection. Add CAPTCHA or email verification. |
| 9 | Abuse: DLP bypass via encoding/obfuscation | Medium | Medium | Scan decoded content (base64 decode before scanning). Add entropy checker as secondary signal. | Add ML-based classifier in future version. Log suspicious patterns for human review. |
| 10 | Single-node PostgreSQL failure | Low (Fly managed) | High | Fly Managed Postgres includes HA and automatic backups | Restore from backup. Data loss limited to backup interval. |
| 11 | Redis data loss (inbox messages) | Low | Medium | Upstash replicates within region. Messages also stored in inbox_messages table. | Replay from PostgreSQL inbox_messages table if Redis data is lost |

## Business Risks

| # | Risk | Likelihood | Impact | Mitigation | Contingency |
|---|------|-----------|--------|------------|-------------|
| 12 | Google A2A protocol becomes dominant standard | Medium | Medium | Design Hub to be A2A-compatible (expansion roadmap item). Use Agent Cards. | Implement A2A transport layer alongside native API |
| 13 | Competitor launches similar marketplace before DelegateOS | Medium | Medium | Focus on unique differentiators: crypto delegation tokens, trust tiers, DLP, economic settlement. Move fast. | Pivot to B2B/enterprise offering rather than open marketplace |
| 14 | delegate-os SDK never reaches 1.0 or gets abandoned | Low | High | The Hub wraps SDK functions; minimal direct exposure of SDK types in the public API. | Fork and maintain critical SDK functions within the Hub codebase |

## Unvalidated Assumptions

| # | Assumption | Risk if Wrong | Suggested Validation |
|---|-----------|---------------|---------------------|
| 1 | 50-200 agents achievable on single-node PG + Redis | Performance degradation, user complaints | Load test with simulated agents before launch |
| 2 | Polling at 60-second intervals is acceptable latency for agents | Agents miss time-sensitive delegations | Survey early adopters; offer SSE upgrade for low-latency needs |
| 3 | Microcent ledger is sufficient without real payment processing | Users want real money movement from day one | Validate with early adopter interviews before building Stripe integration |
| 4 | DLP scanning adds < 50ms per message | Scanning exceeds 500ms latency budget | Benchmark scanner with representative payloads before deployment |
| 5 | AI agents can self-onboard from /agent-setup page | Agents need more guidance or different formats | Test with Claude Code, GPT, and Gemini agents during internal PoC |
