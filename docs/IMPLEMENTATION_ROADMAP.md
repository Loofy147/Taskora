# Taskora implementation roadmap

**Updated:** 2026-10-17  
**Purpose:** order engineering work by risk reduction and user-visible value. This roadmap describes local implementation state; it does not imply deployment or production verification.

## Current boundary

| Capability | State | Evidence / remaining gate |
|---|---|---|
| Browser task UI, projects, comments and sample team | Implemented as prototype | Zustand store in `src/lib/store.ts`; seeded demo data remains the default |
| Local JSON backup/restore | Implemented | `src/lib/workspace-backup.ts`; schema and reference checks; explicit restore confirmation |
| Personal workspace snapshot bridge | Implemented locally, not end-to-end verified | `workspace-data.ts`, `workspace-storage.server.ts`, `workspace-sync.ts`, and `migrations/0001_workspace_storage.sql`; needs authenticated PostgreSQL integration and browser QA |
| Authenticated durable storage by default | Disabled in shipped environment | `.grok/app-env.json` disables auth and database provisioning; cloud endpoints fail closed while `VITE_AUTH_ENABLED=false` |
| Per-task relational CRUD | Not implemented | Current operational state is still a whole-workspace Zustand snapshot |
| Team workspaces and invitations | Not implemented | Sample team members are not verified accounts |
| Real file upload/download | Not implemented | Current attachments are metadata references only |
| Email, notification delivery, audit/retention runbooks | Not implemented / partial | UI notifications are sample data; a small workspace snapshot event ledger exists locally |
| Repository import and remote CI | In progress | A bootstrap transport is staged on GitHub; verify the import workflow extracted source and normal CI completed before treating `main` as the source of truth |

## Recommended solution

Keep the current React/TanStack Start application, existing Better Auth/session middleware, PostgreSQL driver and Vite/PGlite preview. Do not switch the stack or add a new hosted auth/data layer just to solve a schema and authorization problem. The least disruptive path is to preserve the current UI behind typed service functions, move state ownership from browser-only storage to authenticated server operations, and migrate data in small steps.

The local snapshot bridge is an interim adapter: it validates the whole payload, derives a personal workspace from the verified session, uses owner membership checks, and performs compare-and-swap revision updates. It protects against stale-tab overwrites but is not a collaborative data model. It should not be marketed as team collaboration.

## Execution sequence and exit gates

### Gate 0 — Repository source of truth

1. Complete the GitHub authentication step and run the staged source importer.
2. Verify that `.taskora-import/` and the temporary importer workflow disappear, and that the root contains `src/`, `package.json`, `migrations/`, and the project docs.
3. Inspect the imported commit and require the normal CI workflow to finish on that exact SHA.

**Exit:** complete source tree is on `main`; CI results are visible and attached to the commit. A staged ZIP or passing local tests alone does not satisfy this gate.

### Gate 1 — Authenticated personal snapshots

1. Provision the existing auth provider and a durable PostgreSQL `DATABASE_URL` in the deployment environment. Keep credentials in the platform secret store; never commit `.env` files.
2. Apply `0001_workspace_storage.sql` through the existing migration runner and verify the resulting tables/indexes from a fresh database.
3. Test explicit upload, load, page reload/resume, and backup restore in a browser against the deployed auth session.
4. Test that `VITE_AUTH_ENABLED=false`, missing/expired sessions, malformed data, oversized payloads and mismatched workspace IDs are rejected.
5. Use two independent accounts and prove that account A cannot inspect, load, mutate or infer account B's snapshot. Test two concurrent writers: one succeeds; a stale revision gets a conflict and never silently wins.

**Exit:** database integration passes and the security tests run in CI. Do not enable cloud sync for customers before this gate.

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

Complete the repository import connection, verify the real code is on GitHub, then commit the local snapshot bridge and roadmap as a separate change. The current local dependency-free regression suite is green (224/224 tests); full npm install, the TypeScript-dependent test phase, application-wide typecheck, lint, build and browser/backend integration remain open until dependencies and remote CI are available.
