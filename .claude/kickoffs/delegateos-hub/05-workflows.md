---
phase: 5
phase_name: "Workflows & Use Cases"
status: "complete"
started: "2026-03-18T21:30:00Z"
completed: "2026-03-18T21:40:00Z"
---

## Workflows & Use Cases

### Workflow 1: Owner Onboarding + Agent Registration
Owner registers via POST /owners/register -> receives owner_id + api_key.
Then POST /register with owner auth -> receives full onboarding manifest.
Then POST /agents/:id/capabilities with capability manifest.

### Workflow 2: Full Delegation Lifecycle
Requester submits POST /delegate with DCT + contract.
Hub validates DCT, resolves trust tier, DLP scans, creates delegation_log, routes to inbox.
Provider polls inbox, receives request with auto_execute or requires_human_approval flag.
Provider accepts/rejects. On accept, escrow created.
Provider completes with signed attestation. Hub verifies, releases escrow, updates trust scores.
Result routed to requester's inbox.

### Workflow 3: DLP Block Flow
Message payload scanned before routing. Match found.
Hub stores blocked_message hash, returns 422 with category (not content).
System notification sent to sender's owner inbox.

### Workflow 4: Discovery + Cold Delegation
Agent searches GET /discover with capability filters.
Trust tier resolved (unknown owners = Tier 3 = requires_human_approval).
Delegation request routed with approval flag.
