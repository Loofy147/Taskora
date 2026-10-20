# Taskora deployment tracks

**Decision type:** accepted architectural direction with staged implementation. This file describes roles and acceptance policy; it does not imply the control plane or durable cloud workspace is already enabled.

**Architecture contract:** [Two-plane architecture and control boundary](TWO_PLANE_CONTROL_ARCHITECTURE.md).

## Product principle

Optimize the first successful task entry, but keep data ownership and operational authority explicit. One deployment is the personal workspace and intended future operator console; the other is the scalable runtime. They are not interchangeable, do not share a database by default, and must not be described as synchronized.

## Track A — Vercel: scale plane

**Purpose:** the customer-facing, authenticated Taskora application and authoritative shared task/project state after its database/authentication is configured and accepted.

- Intended to own durable task/project records and enforce actor identity, workspace membership, authorization, per-record versions and idempotency at the server boundary.
- Task operations belong to the domain service; platform-control commands must not bypass it to modify customer data directly.
- The internal engineering backlog becomes live only when real authenticated persistence is proven by create/edit/archive/reload tests.
- Do not enable team invitations or advertise collaborative workspaces until interactive multi-account isolation and membership/permission E2E have passed.

**Current status (checked 2026-10-20):** production alias resolves to a Ready deployment on main commit 34469fa95bbcf6fb5ec674c4eb93a0e31ca074a0; the Vercel project environment inventory returned no variables. The last-24-hour runtime error query returned no clusters, but this does not prove application workflows. Durable authenticated cloud use remains **not verified**.

**Release gates:** real per-app authentication and durable PostgreSQL configured in platform settings; migrations pass against a disposable database; permitted authenticated browser session creates/edits/archives/reloads durable records; retry/conflict/error recovery works; backup recovery is tested; mandatory automated authorization-denial tests pass.

## Track B — AppDeploy: personal plane and future operator console

**Current purpose:** low-friction personal task capture, browser-local use, mobile usability, manual backup/restore and controlled UX experiments.

**Future purpose:** a private operator console that reads verified platform state and, only through a separately implemented restricted server-side gateway, submits named and audited operational commands to the scale plane.

- Keep the AppDeploy application useful when Vercel cloud setup is unavailable; it must not depend on Taskora's production database to display personal tasks or access its own settings.
- Treat personal records as browser-local and independent unless a specific transfer is explicitly requested and verified.
- Preserve the last inspected source snapshot 1792339899173 as the documented baseline until a deliberate AppDeploy change-set is prepared.
- In that exact snapshot, CLOUD_SNAPSHOT_ENABLED and CLOUD_TASK_STORAGE_ENABLED are false. The source uses browser storage and local JSON backup; status reported Ready but did not prove authenticated E2E.
- Backend task endpoints in the AppDeploy source are not the same as a Vercel deployment-management API. No verified controller path is currently enabled.
- Never place provider credentials or database secrets in client code, localStorage, personal backup files, or logs.
- Do not grant unrestricted provider control. The exact approved command list, credential scope and gateway hosting are implementation gates, not assumptions.

## Control contract and authority

All cross-deployment operations must follow [the two-plane command lifecycle, permission matrix and tests](TWO_PLANE_CONTROL_ARCHITECTURE.md). Start read-only. Only consider controlled preview operations after the read-only phase passes. Production promotion/rollback require target-specific approval and verified pre/postconditions. Secret changes, arbitrary shell/API access and destructive database operations remain outside v1.

The controller is not a dependency of normal customer task requests. Track A must continue to serve when Track B or the controller is offline; manual recovery through the hosting provider remains available.

## Data movement between tracks

No implicit synchronization. Moving personal data into the scale plane requires explicit, user-initiated import/export:

1. Versioned export and preview of record counts.
2. Schema, ownership, ID and duplicate validation before writes.
3. A conflict report that never silently overwrites either source.
4. A destination backup and a clear cancel/rollback path.
5. Post-import comparison proving the resulting records.

Until that exists, records on Track A and Track B are separate. Do not reuse Vercel task records as the personal console's command/audit store, and do not put customer task content into provider-control logs.

## Acceptance prioritization

### P0 — personal-use path

- First-use navigation is clear; the local board remains available without cloud setup.
- Cloud setup failure is clearly explained without false persistence success.
- A signed-in person can create, edit, finish, archive and reload tasks once the durable workspace gate is configured.
- Writes are version-checked, retries do not create duplicates, time handling is explicit, and authorization denial tests remain green.
- Backup/restore and failed-network recovery have evidence before production rollout.

### P1 — read-only operator visibility

- [ ] Authenticated private operator access.
- [ ] Exact project, environment, deployment ID, source SHA, CI summary and data-freshness timestamp.
- [ ] No decrypted secrets and no write-capable UI/API.
- [ ] Unauthorized access, stale status and gateway failure tested.

### P2 — team collaboration and guarded controls

- [ ] Interactive two-account browser E2E for workspace isolation, membership roles, invitations and session boundaries before shared workspaces.
- [ ] Non-production controller operations pass authorization, idempotency, replay, timeout and reconciliation tests.
- [ ] Production promotion/rollback stays disabled until target-specific approval, release checks, audit persistence and manual recovery are verified.
- [ ] Team administration UX and safe local-board migration completed.

## Operating rules

- One coherent code change-set, one review, CI verdict tied to its exact commit.
- Documentation-only changes do not require a production deployment.
- Keep source commits, Vercel deployment SHAs, AppDeploy revisions, databases, QA evidence and release gates distinct.
- Mark a task complete only with the expected result and exact evidence.
- Prefer fewer user steps; security and recovery invariants belong in the implementation, not as manual chores for the user.
