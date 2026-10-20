# Taskora deployment tracks

**Decision type:** provisional product strategy. This document separates two useful experiences without pretending they share state or are interchangeable.

## Product principle

Optimize the first successful task entry before expanding collaboration features. The first-use path should let a person capture and update a task with minimal setup. Require sign-in only when entering the durable cloud workspace; keep the existing local board available as the no-account path. Do not make the user configure infrastructure.

## Track A — Vercel: durable workspace

**Purpose:** the canonical cloud-backed workflow when the database/auth gate is configured and accepted.

- Stable, authenticated personal workspace with PostgreSQL-backed task/project records.
- Tasks support status, priority, descriptions, due dates, timezone-aware schedules and assignment.
- The internal Taskora engineering backlog lives here as ordinary task records after persistence is working.
- The local demo remains a separate, explicit entry path; never imply local demo records are already cloud-synced.
- A personal-workspace launch does not require a manual two-account browser exercise as a release gate. Automated domain tests for actor identity, membership authorization, outsider/viewer denial and cross-workspace identifiers remain mandatory.
- Do not enable team invitations or advertise collaborative workspaces until interactive multi-account isolation and membership/permission E2E have passed.

**Release gates:** auth and database configuration stored as platform secrets; migrations pass on a disposable database; one permitted authenticated browser session can create/edit/archive/reload durable records; idempotency/conflict/error recovery behaves as expected; backups can be restored; automated authorization-denial tests pass.

## Track B — AppDeploy: low-friction personal board

**Purpose:** a lightweight, fast-start experience for quick capture, mobile usability experiments and testing simpler workflows.

- Preserve the current v16 revision as the baseline until a deliberate AppDeploy change-set is prepared.
- Prefer immediate access, minimal setup and a straightforward mobile interface.
- Treat its data as independent from Vercel. Do not claim a shared database, cross-deployment identity, or automatic synchronization.
- Before positioning AppDeploy as a durable record system, verify reload persistence, owner switching, export/import and recovery on that exact revision.
- Keep it useful as a lightweight personal surface, even if the Vercel cloud workspace offers the richer durable workflow.

This is a target role, not a claim that every point is already implemented in AppDeploy v16.

## Data movement between tracks

No implicit synchronization. If moving data becomes necessary, implement an explicit, user-initiated transfer with:

1. Versioned export and preview of record counts.
2. Schema, ID and duplicate validation before writes.
3. A conflict report that does not silently overwrite either source.
4. A backup of the destination and a clear cancel/rollback path.
5. A post-import comparison proving the result.

Until that exists, users should understand that Track A and Track B keep separate records.

## Acceptance prioritization

### P0 — personal-use path

- First-use navigation is clear; the local board remains accessible without cloud setup.
- On Vercel, cloud setup failures give a clear explanation and a path back to the local board; no false success when persistence is unavailable.
- A signed-in person can create, edit, finish, archive and reload their tasks.
- Writes are version-checked, retries do not create duplicates, time handling is explicit, and automated access-control tests remain green.
- Backup/restore and failed-network states have an evidenced recovery path before production rollout.

### P2 — enable only with collaboration features

- Execute real two-account browser E2E for cross-workspace read/write isolation, membership roles, invitations, assignments and session boundaries.
- Complete team administration and shared-workspace UX.
- Do not hold the personal-use launch hostage to interactive two-account E2E, but do not remove the server-side authorization controls or their automated negative tests.

## Operating rules

- One code change-set, one review, one CI verdict tied to its exact commit.
- No production deployment for documentation-only or planning-only changes.
- Keep Vercel and AppDeploy evidence, revisions, databases, status and release gates distinct.
- Mark an acceptance task complete only with the exact expected result and evidence.
- Prefer the fewest steps for users; keep security and data-recovery invariants in the implementation, not as extra user chores.
