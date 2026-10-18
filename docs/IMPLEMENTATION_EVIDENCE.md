# Taskora implementation evidence ledger

**Updated:** 2026-10-18  
**Latest full CI:** [run 39153304648](https://github.com/Loofy147/Taskora/actions/runs/39153304648) — all jobs passed at source commit `7a8791ad51e43c52bdbc8a229761c530c10f952b`  
**Baseline:** `main` at `0accd42982a2b4809f9d905db569e5e21887756e`  
**Implementation branch:** `feat/domain-contracts-authz-migration-ci`  
**Pull request:** [#18](https://github.com/Loofy147/Taskora/pull/18) — open; not merged

This ledger separates code presence and automated verification from claims that require a real authenticated deployment.

| Capability / claim | Status | Evidence boundary |
|---|---|---|
| Existing architecture baseline | ESTABLISHED | Repository inspection: the current main UI state remains local-first; the existing cloud bridge is a whole-workspace snapshot, not the normalized task service described below. |
| Normalized entity contracts | CI PASS | `src/lib/domain-contracts.ts` validates task/project/membership/subtask/comment records, date-only deadlines, offset-bearing instants, scheduling intervals, entity versions, and strict mutation inputs. |
| Cross-entity invariants | CI PASS | Contract tests cover project/task workspace scope, active same-workspace creators and assignees, comment authors, subtask parent references, unique IDs/memberships, and exactly one active owner in represented workspaces. |
| Role/capability matrix | CI PASS | Explicit Owner/Admin/Member/Viewer policy and tests. The matrix is policy logic, not authentication by itself. |
| Normalized PostgreSQL schema | CI PASS | `migrations/0002_normalized_domain.sql` adds projects, tasks, task-assignee links, subtasks, comments, membership status/revocation fields, foreign keys, checks, and indexes. The run applied migrations to disposable PostgreSQL, reapplied idempotently, and verified migration records/tables/constraints. |
| Transaction API for database adapters | CI PASS | `src/lib/db.ts` exposes atomic transactions for Neon/PostgreSQL and PGlite; rollback behavior is exercised in integration tests. Nested transactions fail explicitly. |
| Normalized task/project service | CI PASS in embedded PGlite | `src/lib/taskora-domain.server.ts` implements idempotent personal-workspace bootstrap; create/list projects; create/get/list/update/archive tasks; active-membership authorization; same-workspace project/assignee checks; keyset pagination; and optimistic-version conflicts. Integration tests cover allowed and denied actions, revoked assignees, rollback, cross-workspace IDs, and stale versions. |
| Authenticated server-function boundary | CI PASS | `src/lib/domain-data.ts` wraps operations in `authMiddleware` and derives the actor from verified `context.userId`; actor IDs and roles are not accepted as request authority. |
| Latest full automated CI | PASS | Run [39153304648](https://github.com/Loofy147/Taskora/actions/runs/39153304648): tests, TypeScript, lint, production build, and the separate real-PostgreSQL migration job all succeeded at `7a8791ad51e43c52bdbc8a229761c530c10f952b`. |
| Existing UI wired to normalized service | NOT IMPLEMENTED | The new service and authenticated functions are additive; the existing task/project UI has not yet been switched to them. Do not infer UI-backed durable persistence from service tests. |
| Real Better Auth browser lifecycle | NOT RUN | CI migrations verify schema creation only. Sign-in/sign-out, session expiry/refresh, reauthentication, and browser cookie behavior against staging remain unverified. |
| Two-account deployed E2E | NOT RUN | PGlite tests prove service-level isolation for separately seeded workspace identities, not end-to-end isolation through deployed HTTP/browser sessions using two real accounts. |
| Live configured staging/production persistence | NOT VERIFIED | CI used a disposable PostgreSQL service. No external deployment secrets or customer database were touched. |
| AppDeploy deployment | NONE | No deployment was used for this implementation increment. |
| Cloud snapshot synchronization | DEFERRED | Not a primary objective; do not expand this work until the core service and real-world verification justify it. |

## Next gated work

1. Add or complete browser tests against an explicitly disposable authenticated staging deployment: sign-in, session lifecycle, two real accounts, cross-workspace read/write denial, and concurrent version conflicts.
2. Integrate the existing UI behind a controlled rollout boundary, preserving local-first state until API-backed read/write, failure handling, recovery, and data migration pass acceptance tests.
3. Complete team membership lifecycle and permission enforcement (invites, revocation, owner transfer, last-owner invariant) before claiming complete collaboration.
4. Then proceed to file handling, delivered notifications, and automations. Do not deploy to customer traffic until the applicable gates are executed and recorded.
