# Taskora two-plane architecture and control boundary

**Decision ID:** ADR-TASKORA-001  
**Reviewed:** 2026-10-20  
**Status:** Architecture direction accepted for implementation planning; controller implementation and production authority are **not enabled**.  
**Evidence rule:** This document distinguishes verified current state from target behavior. A deployment marked Ready is not an end-to-end acceptance result.

## 1. Decision

Taskora will have two distinct planes:

- **Personal plane (Track B / AppDeploy):** the operator's private, low-friction workspace and, in a later phase, an operator console for observing and requesting approved operations against the scalable deployment.
- **Scale plane (Track A / Vercel):** the customer-facing application and its authoritative authenticated domain state, once real authentication and durable PostgreSQL are configured and accepted.

The personal plane may manage a **small, allow-listed set of control actions** through a server-side management gateway. It must not gain unrestricted access to the scale plane's database, environment secrets, arbitrary provider APIs, or arbitrary code execution. The scale plane must continue serving its users if the personal plane is unavailable.

This is stronger than two unrelated deployments, but only after the control gateway and its security controls exist. Until then, the deployments remain independent applications with separate records.

## 2. Current evidence snapshot

| Claim | Status | Evidence and boundary |
|---|---|---|
| Vercel production alias resolves to a Ready deployment | **ESTABLISHED** | The production alias inspected on 2026-10-20 resolves to deployment dpl_gwwy8BETdwEtLg2bfje8yekhESER, source main at 34469fa95bbcf6fb5ec674c4eb93a0e31ca074a0. |
| Vercel project environment inventory is configured | **CONTRADICTED by current inventory** | The project environment query returned envs: [] and hiddenProductionEnvCount: 0. Authenticated PostgreSQL-backed use is therefore not verified. |
| Vercel had runtime error clusters in the last 24 hours | **No error clusters returned** | This is an observation for that query window only; it does not prove functional correctness or absence of client-side failures. |
| AppDeploy v16 is Ready | **ESTABLISHED** | App taskora-ube0f6, source snapshot revision 1792339899173; status query returned Ready and an empty frontend/network/backend error snapshot. |
| AppDeploy automatic snapshot/task cloud persistence is enabled | **CONTRADICTED** | In that exact source snapshot, CLOUD_SNAPSHOT_ENABLED = false and CLOUD_TASK_STORAGE_ENABLED = false; the board uses browser localStorage and tells the user to use local JSON backup. |
| AppDeploy controls Vercel deployments today | **UNKNOWN / not implemented in evidence reviewed** | No working management API or deployment-control path was evidenced by the inspected source/status. Do not infer controller capability from AppDeploy backend task routes. |
| The operator flows have passed authenticated E2E | **UNKNOWN / not passed** | The latest status response supplied no executed E2E result. Empty error arrays and Ready status are not E2E evidence. |

This snapshot is an audit baseline, not a permanent assertion. Re-check the exact revision, environment inventory, deployment SHA and test evidence before enabling a new capability.

## 3. Topology and trust boundaries

~~~mermaid
flowchart TB
    OP[Operator]
    subgraph P[Personal plane — AppDeploy]
      UI[Private workspace and future operator console]
      LOCAL[Browser-local personal records and manual backup]
    end
    subgraph G[Restricted control boundary — not implemented yet]
      AUTH[Operator authentication and authorization]
      POLICY[Allow-list, preconditions, approvals and idempotency]
      ADAPTER[Server-side provider adapter]
      AUDIT[Append-only command/evidence ledger]
    end
    subgraph S[Scale plane — Vercel]
      APP[Taskora web app and authenticated domain API]
      DB[(Durable PostgreSQL — not yet configured)]
      VAPI[Vercel deployment/control API]
    end
    OP --> UI
    UI <--> LOCAL
    UI --> AUTH
    AUTH --> POLICY
    POLICY --> ADAPTER
    POLICY --> AUDIT
    ADAPTER --> VAPI
    APP --> DB
    ADAPTER -. read-only status / approved deployment operation .-> APP
~~~

The control boundary shown above is a **target design**. It is not present merely because the diagram exists. Hosting the server-side adapter inside AppDeploy is a candidate, subject to verifying outbound API support, secret storage, request limits, logging behavior, and the ability to restrict the credential. If those conditions cannot be demonstrated, keep control actions manual or host the adapter in a dedicated failure domain.

### Authority separation

- **Personal task state** belongs to Track B and remains private unless the operator explicitly exports or shares it.
- **Customer task/project state** belongs to Track A's authenticated domain service and durable database. The control plane does not write customer records as an administrative shortcut.
- **Provider deployment state** belongs to Vercel. The controller reads it from the provider and stores only the identifiers, status snapshots, and evidence required for its audit trail.
- **Audit history** must not exist only in browser storage. A successful control operation must have a durable server-side record independent of the UI session.
- **Secrets** are server-side only. No Vercel credential, API token, database URL, signing key, or privileged session may be shipped to the browser, stored in localStorage, included in exported backups, or written to client-visible logs.

## 4. Command lifecycle

All management actions use a small, typed command contract rather than arbitrary URLs or raw provider payloads.

A request must identify:

- **requestId:** UUID idempotency key;
- **action:** a registered action name, never a client-supplied URL or command string;
- **target:** exact Vercel project and environment, plus deployment ID or source commit SHA when relevant;
- **expectedState:** the deployment ID / commit SHA / revision observed by the operator;
- **reason:** concise operator intent;
- **expiresAt:** a short expiry for the approved operation;
- **approval:** server-issued approval reference when the action requires confirmation.

The server derives **actorId** from a verified session. It must ignore any actor, role, project scope, or permission asserted by the browser. Canonicalize and hash the request body: replaying the same key and same payload returns the recorded result; reusing the key with a different payload returns a conflict.

Required state progression:

**proposed → validated → awaiting_approval (when required) → queued → running → succeeded | failed | outcome_unknown**

Before execution, re-check target ownership, authorization, exact expected state, CI/check status and expiry. If a provider call times out after submission, record outcome_unknown, query provider state and reconcile before retrying. Never assume timeout means the operation did not happen.

For each command, append events for request accepted, actor authorized, preconditions checked, approval obtained, provider call started, provider result received, postcondition verified and final outcome. Preserve provider request IDs and deployment/commit identifiers, but redact credentials and sensitive task content.

## 5. Initial permission matrix

| Capability | Initial policy | Required guard |
|---|---|---|
| Read deployment status, source SHA, check summaries and recent error aggregates | Allow after operator sign-in | Label freshness and query window; never expose secret values |
| Read environment-variable names and targets only | Allow only if available and useful | Never request decrypted values; redact values in all paths |
| Inspect a known preview deployment | Allow | Validate project, URL, owner and source revision |
| Request a preview for a reviewed branch/commit | Later phase | Existing CI policy must remain authoritative; no arbitrary uploads |
| Promote an exact, already-verified deployment to production | Disabled initially | Explicit per-operation approval, matching source SHA, green required checks, deployment identity precondition, post-promotion verification and rollback reference |
| Roll back to an exact previously accepted deployment | Disabled initially | Explicit approval, verify target health and compatibility, record reason, verify resulting alias/source |
| Modify production environment secrets, authentication configuration, billing, project ownership or access grants | Prohibited in v1 | Use provider's authenticated administrative workflow with manual review |
| Execute arbitrary shell commands, arbitrary API paths, raw SQL or unreviewed migrations | Prohibited | Never expose as a generic admin-command capability |

A single-person operator may approve an operation they initiated, but the system must still require an explicit, scoped confirmation for high-impact actions. This is not equivalent to separation of duties; if the platform later supports multiple operators, production approval policy should be upgraded to reviewer separation.

Use the narrowest credential that the provider actually supports. Verify provider permission semantics before implementation; if a project-scoped or action-limited credential is unavailable, do not automate production writes with a broad account-wide token.

## 6. Security invariants

1. **Fail closed:** missing session, missing policy, expired command, unknown project, stale expected state or unavailable authorization service means no write.
2. **Least privilege:** UI code has no provider credential. The gateway exposes only named operations and validates every field server-side.
3. **No confused deputy:** the gateway verifies that the operator is authorized for the exact project/environment/action; it does not treat possession of a generic endpoint URL as authorization.
4. **Replay safety:** every write uses a server-side idempotency record and payload hash; concurrent duplicates converge on one operation.
5. **No stale promotion:** a command cannot promote a deployment merely because its URL exists. Its immutable deployment ID, commit SHA, branch, target environment and required checks must match the approved request.
6. **Bounded execution:** fixed timeouts, payload limits, per-operator and per-action rate limits, a bounded queue, and explicit handling of provider throttling are mandatory.
7. **Audit integrity:** log actor, action, target, reason, request hash, timestamps, approvals, provider identifiers, pre/postcondition results and outcome. Do not log tokens, credentials, full environment values, or private task payloads.
8. **Failure independence:** loss of Track B or the gateway must not stop normal Track A requests. Loss of Track A must not remove the operator's access to provider-level recovery controls.
9. **Recovery outside the controller:** retain a documented, tested manual provider-console break-glass path; protect it separately and periodically test it.
10. **No invisible sync:** personal task records, customer task records and control/audit records are different data classes. Transfers require a versioned, previewed and recoverable import/export process.

## 7. Failure handling

| Failure | Required behavior |
|---|---|
| Personal plane unavailable | Track A continues serving; operator uses provider console for recovery |
| Control gateway unavailable | No queued command is claimed successful; Track A remains independent |
| Provider API throttled or unavailable | Back off within a fixed retry budget; preserve operation ID and report current/unknown state |
| Command times out after submission | Mark outcome unknown; reconcile provider state before retrying |
| Audit persistence fails | Reject high-impact writes; never execute an unrecorded production operation |
| Deployment status is stale | Show timestamp and stale label; disable actions that depend on that status |
| Rollback target is missing or incompatible | Block rollback; require manual investigation |
| AppDeploy local state is cleared | Restore from validated personal backup; do not claim Track A data was changed |
| PostgreSQL/auth remains unconfigured | Vercel cloud workspace stays disabled/fail-closed; do not seed or report live persisted tasks |

## 8. Delivery phases and exit gates

### Phase 0 — Document the boundary (current)

- [x] Separate the intended personal and scale roles.
- [x] Record source/deployment evidence and explicit unknowns.
- [x] Prohibit assumed sync and unrestricted cross-deployment credentials.
- [ ] Keep implementation status as **not enabled** until each gate below is proven.

### Phase 1 — Read-only operator visibility

Implement the minimum authenticated console/gateway needed to view exact deployment ID, target environment, source SHA, CI summary, runtime-error window and last refresh time. Do not expose decrypted secrets. No mutation endpoints in this phase.

Exit only when unauthorized requests are denied, stale/error states are explicit, audit reads are authorized, and the console remains usable if the scale app's task APIs fail.

### Phase 2 — Safe non-production operations

If needed, add a small allow-list for preview inspection and requesting preview work from a reviewed source revision. Test idempotent replay, forged targets, stale source references, provider timeout, rate limiting, and error reconciliation. Preserve Vercel/GitHub branch protection.

Exit only when tests prove the gateway cannot target another project, cannot invoke arbitrary API routes, cannot bypass required checks, and does not leak credentials.

### Phase 3 — Guarded production operations

Keep promotion and rollback disabled until Phase 1–2 are accepted, the database/auth release gates for Track A are satisfied, and a manual break-glass drill has passed. Each high-impact operation requires an explicit target-specific approval, an immutable known-good deployment reference, durable audit events and verified postconditions. Secret changes and destructive migrations remain manual in v1.

### Phase 4 — Scale and automate

Only after measured workload justifies it, consider command queues, reconciliation workers, alerting and multi-operator approvals. Bound concurrency and queue age. Separate business task scheduling from deployment-control scheduling; neither is implemented by merely storing due dates in task records.

## 9. Mandatory tests before write authority

- [ ] Anonymous request and expired session cannot read private status or submit a command.
- [ ] Forged actorId, role, project ID, environment or deployment ID is denied.
- [ ] Unknown action, arbitrary URL, unsupported field, oversized request and expired approval are rejected.
- [ ] Same request ID + same canonical payload is idempotent; same request ID + changed payload conflicts.
- [ ] Concurrent duplicate submissions execute at most once.
- [ ] A stale expected deployment/commit is rejected after provider state changes.
- [ ] A preview cannot be promoted when checks are missing, pending or failed.
- [ ] Provider timeout after submission enters reconciliation, not blind retry.
- [ ] Failure to append the audit event blocks high-impact execution.
- [ ] Secrets are absent from client bundles, browser storage, exported JSON, URLs, error messages and logs.
- [ ] Gateway rate limits and allow-listed target checks are exercised.
- [ ] A known-good rollback is verified in staging and its postcondition recorded.
- [ ] Track A remains available when Track B/gateway is unavailable.
- [ ] Manual provider-console recovery is exercised and documented.
- [ ] Tests and logs are linked to the exact code commit and environment.

## 10. Release and change policy

- Do not connect a broad Vercel credential to the existing AppDeploy UI.
- Do not deploy code or enable any control mutation as part of a documentation-only change.
- Prepare controller code, security tests, threat model and runbook as one reviewed change-set before creating a live management integration.
- A green CI run proves only the checks executed against its exact commit. A Ready deployment and empty error list are insufficient for write authority.
- Production remains unchanged unless a separately reviewed, evidence-backed release is explicitly approved.

## 11. Architecture decision record

**Decision:** two planes, one deliberately narrow control boundary, no implicit task-data synchronization.

**Why:** preserve personal productivity and operational independence while making a path to manage releases without placing provider credentials in the browser or coupling the production app to its own administrator.

**Rejected alternatives:**
- Two unrelated deployments with no shared contract: safe initially, but offers no consistent operational control or audit.
- Full bidirectional data sync: unnecessary coupling, conflict complexity and accidental-overwrite risk before both stores are accepted.
- Personal browser holding a provider-wide credential: unacceptable credential exposure and excessive authority.
- The scale app administering itself through its public task API: mixes customer business operations with platform administration and shares the same failure domain.

**Revisit when:** actual scale requirements, provider credential scope, control-gateway hosting capabilities, or multi-operator approval needs change. Revisit must use fresh evidence, not assumptions.
