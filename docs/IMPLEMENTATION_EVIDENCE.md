# Taskora domain-foundation evidence ledger

**Updated:** 2026-10-18  
**Baseline:** \`main\` at \`0accd42982a2b4809f9d905db569e5e21887756e\`  
**Implementation branch:** \`feat/domain-contracts-authz-migration-ci\`  
**Pull request:** [#18](https://github.com/Loofy147/Taskora/pull/18) — open; not merged

This ledger distinguishes source changes from behavior verified by an executed test. It does not treat a planned gate or a green frontend build as evidence of live authenticated persistence.

| Capability / claim | Status | Evidence boundary |
|---|---|---|
| Existing Taskora architecture baseline | ESTABLISHED | Repository inspection: local-first Zustand state; whole-workspace snapshot bridge; auth and database provisioning disabled by default in \`.grok/app-env.json\`. |
| Normalized entity schemas | IMPLEMENTED, VERIFICATION PENDING | \`src/lib/domain-contracts.ts\` adds Zod contracts for task, project, membership, subtask, comment, schedule interval, and mutation inputs. Additive only; not yet wired into production operations. |
| Cross-entity invariants | IMPLEMENTED, VERIFICATION PENDING | Snapshot validator checks project/task workspace scope, active creator/assignee/comment-author membership, subtask parent references, uniqueness, and one active owner per represented workspace. |
| Role/capability policy | IMPLEMENTED, VERIFICATION PENDING | Explicit Owner/Admin/Member/Viewer matrix; the helper does not authenticate actors or replace server-side membership checks. |
| Regression tests | ADDED, VERIFICATION PENDING | \`scripts/domain-contracts.test.mjs\`; remote pull-request CI must execute before this is labelled PASS. |
| Disposable PostgreSQL migration test | ADDED, VERIFICATION PENDING | CI job turns auth on, prepares the canonical Better Auth migration, applies migrations twice, and asserts recorded migrations, tables, and a membership constraint. The job has not yet returned a verdict at the time this ledger was written. |
| Real Better Auth sign-in/session lifecycle | NOT RUN | The disposable migration job proves schema application only, not a browser sign-in, refresh, expiry, or sign-out. |
| Two-account / cross-workspace browser E2E | NOT RUN | The policy contract is not yet wired into normalized server CRUD; live isolation remains an open gate. |
| Per-entity PostgreSQL CRUD and UI integration | NOT IMPLEMENTED | Existing task state remains local-first; this PR does not claim otherwise. |
| AppDeploy deployment | NONE | No deployment was used for this source preparation. |
| Cloud snapshot synchronization | DEFERRED | Not part of the primary objective or this implementation increment. |

## Next verification actions

1. Inspect PR #18 CI results; repair failures before using PASS labels.
2. Provision an explicitly disposable, authenticated staging environment using secret storage, then run sign-in/session and two-account access tests.
3. Use the contracts as the basis for the first normalized task/project service, with database constraints, actor-derived identity, expected-version conflicts, and same-workspace membership checks.
4. Integrate the UI only after the service and its negative tests pass. Do not enable customer persistence or deploy until the applicable gates are executed and recorded.
