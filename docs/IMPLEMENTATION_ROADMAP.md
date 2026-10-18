# Taskora implementation roadmap

**Updated:** 2026-10-18  
**Purpose:** order engineering work by risk reduction and user-visible value. This roadmap separates the repository implementation from the independent AppDeploy staging port. A code-ready deployment is not a production-readiness claim.

## Implementation tracks — keep these separate

- **Track A — GitHub source:** [`Loofy147/Taskora`](https://github.com/Loofy147/Taskora), `main` at audit baseline `5cc189106e3eb0a897708c52beeefe4e7e60ae1b`. This is the maintained React/TanStack Start implementation. The shipped app environment keeps auth and database provisioning off. Its whole-workspace snapshot bridge has embedded PGlite integration tests, but live authenticated PostgreSQL staging remains open.
- **Track B — AppDeploy staging:** [live app](https://taskora-ube0f6.v2.appdeploy.ai/), app ID `taskora-ube0f6`, deployed source revision `1792339899173` (v16 local-first reliability batch; deployment ready, executed E2E verdict not returned). This remains a separate codebase with AppDeploy auth and a key-value managed database. The latest batch adds task input/date/time guardrails, same-assignee schedule-overlap confirmation, List status/priority filters with Clear filters, and explicit cloud deferral. Browser-local task management and JSON backup are the supported current path; authenticated cloud snapshots/task-level storage are disabled in the UI. AppDeploy-only changes do not synchronize to Track A.
- **Evidence boundary:** the AppDeploy system reported status `ready` and no frontend/backend/network errors in its QA snapshot; it did not return an executed E2E result. The user reported account creation and trying inputs, but no specific migration/CRUD test outcome has been recorded. See [AppDeploy staging status](APPDEPLOY_STAGING.md).
- **One release candidate at a time:** do not spend AppDeploy daily deployment capacity on intermediate edits. Prepare the whole candidate and use [the final release runbook](FINAL_RELEASE_RUNBOOK.md) and [version/capability matrix](VERSION_CAPABILITY_MATRIX.md).

## Current boundary

| Capability | State | Evidence / remaining gate |
|---|---|---|
| Browser task UI, projects, comments and sample team | Implemented as prototype | Zustand store in `src/lib/store.ts`; seeded demo data remains the default |
| Local JSON backup/restore | Implemented | `src/lib/workspace-backup.ts`; schema and reference checks; explicit restore confirmation |
| Personal workspace snapshot bridge | Storage-level PGlite integration passes; deployed integration not verified | `workspace-storage.server.integration.test.ts` exercises snapshot round-trip, revision races, event consistency, invalid payload rejection and storage-level user isolation; live PostgreSQL/auth/browser gates remain open |
| Authenticated durable storage by default | Disabled in shipped environment | `.grok/app-env.json` disables auth and database provisioning; cloud endpoints fail closed while `VITE_AUTH_ENABLED=false` |
| Per-task relational CRUD | Not implemented | Current operational state is still a whole-workspace Zustand snapshot |
| Team workspaces and invitations | Not implemented | Sample team members are not verified accounts |
| Real file upload/download | Not implemented | Current attachments are metadata references only |
| Email, notification delivery, audit/retention runbooks | Not implemented / partial | UI notifications are sample data; a small workspace snapshot event ledger exists locally |
| Lint / initial JavaScript chunk baseline | Historical baseline; remeasure after changes | Commit `cf60790` reported six lint warnings and a 701.08 kB client chunk (190.83 kB gzip); later commits require their own CI evidence for current counts and output sizes |
| Repository import and remote CI | Complete at baseline commit `cf60790` | Full source tree is present on `main`; temporary transport/importer are absent; [CI run 39053827997](https://github.com/Loofy147/Taskora/actions/runs/39053827997) passed tests, typecheck, lint, and build on that exact SHA |

## Recommended solution

Keep the current React/TanStack Start application, existing Better Auth/session middleware, PostgreSQL driver and Vite/PGlite preview. Do not switch the stack or add a new hosted auth/data layer just to solve a schema and authorization problem. The least disruptive path is to preserve the current UI behind typed service functions, move state ownership from browser-only storage to authenticated server operations, and migrate data in small steps.

The local snapshot bridge is an interim adapter: it validates the whole payload, derives a personal workspace from the verified session, uses owner membership checks, and performs compare-and-swap revision updates. It protects against stale-tab overwrites but is not a collaborative data model. It should not be marketed as team collaboration.

## Execution sequence and exit gates

### Gate 0 — Repository source of truth (COMPLETE at baseline commit `cf60790`)

Completion evidence:

1. The application tree is present at the root of `main`, including `src/`, `package.json`, `migrations/`, and the project documentation.
2. `.taskora-import/` and `.github/workflows/import-taskora-source.yml` are absent.
3. [GitHub Actions run 39053827997](https://github.com/Loofy147/Taskora/actions/runs/39053827997) passed the configured tests, TypeScript check, lint, and production build against the exact source-population commit.

**Exit:** repository import is complete. A successful CI build still does not mean a live database migration or production readiness; those belong to Gate 1 and the later operational gates.

### Gate 1A — Storage service integration (COMPLETE at commit `52a2b84`)

The real storage service has an embedded PGlite integration suite. It verifies read-only inspection, initialize/load round-trip, distinct-user isolation and cross-account write denial, concurrent initialization, compare-and-swap behavior under concurrent saves, event-ledger consistency, invalid payload rejection, and fail-closed behavior under shared-demo auth mode.

[Post-merge CI run 39056875032](https://github.com/Loofy147/Taskora/actions/runs/39056875032) passed the configured test suites, typecheck, lint, and build. The integration suite refuses to run when `DATABASE_URL` is present; it does not test a live database.

**Exit:** storage-service behavior against embedded PostgreSQL is covered. This does not certify actual login sessions or production readiness.

### Gate 1B — Authenticated PostgreSQL staging (OPEN)

1. Configure the intended staging deployment with `VITE_AUTH_ENABLED=true`, a real per-app auth configuration, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and a durable `DATABASE_URL`. Store secrets in the deployment platform; never commit them.
2. Use the auth-on preflight to create the root migration copy of the canonical `migrations/auth/0001_auth.sql`. Confirm schema-copy drift/missing-source errors block startup/build instead of silently skipping auth schema. Auth-off mode must not apply a leftover generated copy.
3. Apply `0001_auth.sql` and `0001_workspace_storage.sql` through the existing migration runner against a disposable staging database first. Verify applied migration names and schema objects from a fresh database; repeat the migration command to confirm idempotency.
4. Test real sign-in/sign-out, missing and expired sessions, explicit upload, load after reload, resume, restore, invalid/oversized payloads, revision conflicts, database failure and reauthentication in a browser.
5. Use two independent real accounts and prove account A cannot inspect, load, mutate or infer account B's snapshot through the deployed endpoints. Test two concurrent writers; one must get a 409 conflict rather than silently overwriting the other.
6. Keep cloud sync disabled for customers until the above checks pass and the deployed revision's own CI/build evidence is recorded.

**Exit:** live database migration, real authentication, browser persistence flows, failure recovery, and end-to-end two-account isolation pass in staging.

### Gate 2 — Per-entity domain operations

Replace whole-workspace writes with a service/repository layer and server operations such as:

- `listTasks(workspaceId, filters, cursor)`
- `createTask(input, requestId)`
- `updateTask(taskId, patch, expectedVersion)`
- `moveTask(taskId, status, expectedVersion)`
- `deleteTask(taskId, expectedVersion)`
- project, subtask, comment and notification operations with equivalent scope checks

Create normalized tables for tasks, projects, memberships, comments, subtasks, attachment metadata and notifications. Use foreign keys, explicit workspace IDs, bounded list pagination, per-entity versions, and idempotency keys for retryable writes. Keep the current view layer working through a repository interface; migrate one entity family at a time. Provide a tested one-time converter from the validated snapshot format to relational rows, inside a transaction, and keep the backup format versioned.

**Exit:** each mutation is authenticated, workspace-authorized and validated server-side; integration tests cover success, invalid input, stale writes, retries, deletion dependencies and cross-workspace denial.

### Gate 3 — Team workspaces and invitations

Use `workspace_memberships` as the authorization source of truth; role values alone are not enough. Define a capability matrix for owner/admin/member/viewer and enforce it in server service functions. Every query must scope through an authorized membership or a verified personal owner.

Invitation design:

- generate a cryptographically random one-time token; persist only a strong hash of it;
- bind it to workspace, normalized invitee email, role, inviter, expiry and accepted/revoked timestamps;
- accept in a transaction that verifies expiry, email, token hash, workspace status and current membership;
- enforce a unique active membership and single-use acceptance; never allow an invitee to grant themselves a stronger role;
- rate-limit create/resend/accept operations and record audit events.

**Exit:** tests cover expired/replayed invitations, email mismatch, role escalation, existing-member acceptance, revoked workspace access and invitation spam bounds.

### Gate 4 — File storage and notification delivery

Store file bytes in private object storage (S3-compatible/R2) and keep only metadata plus a storage key in PostgreSQL. Issue short-lived signed URLs only after checking the current workspace membership and access level; enforce byte-size and content-type limits, generate safe object names, checksum uploads, and add malware scanning before exposing downloads. Do not use public permanent URLs for private business documents.

For email, use a transactional outbox: task mutations add durable notification/outbox rows inside the same database transaction; a worker sends mail with idempotency, bounded retries and dead-letter/error reporting. The daily digest must read the stored preference and respect unsubscribe/consent requirements.

**Exit:** attachment authorization tests, failed upload recovery, notification duplicate suppression, delivery retry/dead-letter tests and a real end-to-end browser flow all pass.

### Gate 5 — Production operations

- Database backups/PITR and a documented restore drill; retention/cleanup for workspace events and stale invites.
- Structured logs with request IDs and workspace/user identifiers that are pseudonymous where possible; do not log passwords, tokens or task bodies by default.
- Rate limits and payload caps per endpoint/account, cancellation/timeouts around database calls, predictable 401/403/409/413/503 error contracts.
- Browser QA at mobile and desktop widths; check keyboard accessibility and safe loading/error/empty states.
- CI from lockfile install through tests, typecheck, lint, production build and migration verification; monitor build and deployed health per commit.

**Exit:** a documented release checklist and a tested rollback/recovery procedure exist.

## Authorization model: avoid false security

The server-verified session is the source of user identity. Never accept a client-supplied `userId`, role, or owner ID as authority. Server endpoints are directly callable API boundaries, not protected merely because a route or button is hidden. TanStack Start documentation makes the same distinction and provides server-function validation/middleware primitives ([server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions), [Better Auth integration](https://better-auth.com/docs/integrations/tanstack)).

PostgreSQL Row-Level Security (RLS) may be added as defense in depth, but it must be designed around the actual database role and identity propagation. Taskora currently connects with a shared server-side database role; `current_user` therefore does not automatically equal the end-user session. If using a per-request transaction-local identity setting, guarantee `BEGIN`/`SET LOCAL`/queries/`COMMIT` all run on the same connection, ensure the runtime role cannot bypass the policy, and test prepared/pooled connection reuse. Always retain application-level membership authorization. See the [PostgreSQL RLS documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Before enabling RLS in production, verify the database engine's security patch level. PostgreSQL published CVE-2026-14666 affecting RLS policy cache invalidation in versions before 18.6, 17.11, 16.15, 15.19 and 14.24; use a patched release and test authorization after membership/role changes ([official advisory](https://www.postgresql.org/support/security/CVE-2026-14666/)).

## Immediate next action

**Track A:** proceed with Gate 1B, authenticated PostgreSQL staging, only after selecting the actual deployment environment and providing its secrets securely. Validate auth-schema preflight and migrations, then test browser upload/load/restore, failure recovery, reauthentication and two-account isolation.

**Track B:** execute the v16 local-first acceptance workflows in [`APPDEPLOY_STAGING.md`](APPDEPLOY_STAGING.md): task CRUD/reload, invalid-input guardrails, schedule-overlap confirmation, combined list filters/clear, role/responsibility edits, and backup round-trip/rejection. Keep cloud persistence, migration recovery and remote account isolation deferred unless a concrete product requirement justifies reactivation; no authenticated cloud E2E verdict exists.

**Release discipline:** prepare one complete release candidate; don't deploy for documentation edits or isolated source changes. Run static/source checks, reconcile docs and regression definitions, and perform one final AppDeploy deployment only when the final candidate is ready.


## Deployment-capacity discipline

The AppDeploy live source is updated through the deployment operation; there is no separate unpublished AppDeploy source-save step. Keep code corrections, tests, QA and documentation in a single candidate. Do not deploy for documentation-only edits. Use `docs/FINAL_RELEASE_RUNBOOK.md` for the preflight, E2E evidence and release decision. A limited daily deployment allowance is an operational constraint; it is not a reason to skip verification.


## P0 runtime incident — blank screen (2026-10-17)

Track B was reported to stop rendering. External browser evidence confirmed a blank v7 viewport even though AppDeploy status was ready and the QA error lists were empty. Source inspection found a deterministic temporal-dead-zone failure: currentUserId appeared in the first effect dependency array before its const declaration. v8 made the caught rendering error visible; v9 moved the declaration above first use and a fresh external screenshot showed the normal Taskora shell.

Current Track B deployed revision: 1792338457910 (v14). The v12 integrity checks, v13 Settings cleanup and v14 cloud-status correction are documented separately below. AppDeploy reports ready with no frontend/backend/network errors, but the executed E2E result remains unavailable/unreturned; the app is not E2E-verified.

Use [the version and capability matrix](VERSION_CAPABILITY_MATRIX.md) as the complete target map. A v13 read-only browser check confirms the Settings primary controls render and advanced disclosures start collapsed. The next gate remains authenticated task CRUD, snapshot round-trip, migration recovery and two-account isolation; do not treat clean status as a substitute for those workflows.


### V11 review — 2026-10-18

The live rendering path and navigation were rechecked. Strict backup schema validation and local account-key/async-response hardening are present in Track B v11 source. Account switching, actual cloud persistence, import rejection, migration recovery and two-account isolation still require executed E2E evidence. Team membership, binary files, delivered notifications and production operations remain later milestones, not implemented capabilities.


### v12 validation update — 2026-10-18

The live v12 app enforces uniqueness for task/comment/attachment/project/member IDs and verifies task project/assignee references at snapshot and task API boundaries. Anonymous health is `200 application/json`; protected task-mode/tasks/workspace GETs are `401 application/json` with no token or a deliberately invalid bearer token. These results do not prove the two existing accounts are isolated: the available browser session is unauthenticated, so account A/B tests remain open.


### V13 Settings usability update — 2026-10-18

The deployed AppDeploy Track B revision is `1792327799498`. Settings now exposes account sync and local backup as the primary visible controls; task-mode migration, system status, and feature availability are collapsed by default. Unauthenticated browser inspection confirmed this layout. **No auth/data gate changed:** authenticated persistence, task-mode migration retry/recovery, and A/B account isolation remain open because no executed authenticated E2E result has been recorded.


### V14 cloud-status correctness update — 2026-10-18

The deployed Track B revision is `1792338457910`. Remote revision `0` is now treated as a real empty account only after a valid workspace response; failed or invalid reads show `Unknown` and explicit retry guidance. Settings visibly places account sync and local backup before advanced storage and diagnostics. Added a QA-fault regression definition for a simulated `GET /api/workspace` 503. E2E execution is still unconfirmed, so authenticated cloud persistence, migration recovery and two-account isolation remain release gates.


### v16 local-first reliability update — 2026-10-18

- **Current Track B revision:** `1792339899173`, status `ready`.
- **Implemented in deployed source:** browser-local task flow no longer waits on remote cloud-mode verification; task input and schedule guardrails are strengthened; List status/priority filtering and Clear filters are available; Cloud sync and per-task cloud mode are explicitly deferred; JSON backup remains the portable save/restore path.
- **QA evidence:** the returned deployment snapshot has empty frontend/network error arrays and no frontend/backend errors. The actual E2E execution result was not returned.
- **Immediate priority:** execute the current local-first tests and inspect the results. Do not spend more deployment capacity investigating remote snapshots unless remote sync becomes a product requirement.
- **Boundary:** this is Track B only. Track A's GitHub implementation and its persistence architecture are separate.
