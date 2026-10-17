# Taskora version and capability matrix

**Updated:** 2026-10-17  
**Product tracks:** GitHub source (Track A) and AppDeploy staging (Track B) remain separate implementations. A feature marked implemented on one track is not automatically present on the other. Track-specific test evidence must be recorded independently.

## Evidence and status vocabulary

- **Implemented — render checked:** source exists and a live browser screenshot showed the relevant UI. This does not prove the workflow or persistence end to end.
- **Implemented — E2E verified:** the exact deployed revision passed an executed browser test with a stored result.
- **Partial:** only some behavior exists; do not market the whole capability.
- **Planned:** not implemented.
- **Blocked:** must not be released until its stated dependency or acceptance gate passes.
- **Unknown:** evidence has not been collected. Do not infer success from deployment readiness, a successful build, or an empty error list.

## Current AppDeploy staging baseline

- **App ID:** taskora-ube0f6
- **URL:** https://taskora-ube0f6.v2.appdeploy.ai/
- **Current revision:** 1792271940323 (v10; render-checked, E2E unverified)
- **Observed result:** v10 deployment status is ready; validation is valid with no errors (one non-blocking warning recommends focusing the seven-test suite). The QA snapshot reports no frontend/backend/network errors and provides desktop/mobile screenshots. An executed E2E result was not returned.
- **Root cause:** an early effect dependency array referenced currentUserId before its const declaration, triggering a temporal-dead-zone error while rendering. The declaration was moved above its first use.
- **Still unknown:** the AppDeploy status response did not return an executed E2E result. Real sign-in, migration, data persistence, concurrent edits and account isolation remain unverified end to end.
- **Track boundary:** this v9 revision is AppDeploy source. It is not the GitHub application deployed, and it has not been synchronized into GitHub source.

## Capability matrix

| Capability | Track B current state | Target version | Release evidence required |
|---|---|---|---|
| App entry and React startup | Implemented; v9 screenshot shows the normal shell; error boundary and boot fallback added | V0.1 Reliability | Clean/failed start, direct URL reload, desktop + mobile screenshots, JS/page errors |
| Navigation, board, list, calendar | Implemented; render checked, not full E2E verified | V0.1 Reliability | Visit every navigation entry on mobile/desktop; assert no blank, clipped, or dead-end screen |
| Browser storage resilience | Partial; startup/storage guards exist; full restricted-storage behavior not verified | V0.1 Reliability | Storage API denied/throws, app remains usable, warnings are accurate, sign-out remains possible |
| Task create/edit/status/delete | UI and protected API routes exist; E2E not verified | V0.2 Personal workflow | Create → update → move → comment → reload → delete; assert persistence and visible failure states |
| Due dates and timed tasks | Date UI and optional start/end fields exist; server validates HH:mm and end-after-start; E2E not verified | V0.2 Personal workflow | Valid, incomplete, equal, reversed and malformed time ranges; calendar/agenda after reload |
| JSON backup/export/restore | Implemented as personal fallback; live round-trip not recorded | V0.2 Personal workflow | Export/import, invalid/oversized backup rejection, explicit restore confirmation and round-trip equivalence |
| Individual per-task cloud records | Protected per-task list/create/update/delete routes and revisions exist; live DB workflow not E2E verified | V0.3 Durable data | Real sign-in, create/update/delete, refresh/re-login persistence, stale revision conflicts |
| Snapshot-to-task migration | v10 merges saved and submitted snapshot tasks, rejects same-ID divergent content, preflights existing task records, and blocks activation on workspace revision change; E2E unverified | V0.3 Durable data | Execute preservation/conflict/revision-race tests, verify idempotent retry and ownership-safe recovery, prove zero data loss |
| Account-specific browser data | Scoped key strategy exists; two-account browser switching not proven | V0.3 Durable data | Accounts A/B in the same browser; sign-out, sign-in, reload, no cross-account data bleed |
| Role/responsibility fields | Editable local/sample profiles and workload indicators exist; no authorization controls | V0.4 Team workspaces | Persist real members, invite/accept/revoke, enforced owner/admin/member/viewer capability matrix |
| Shared workspace and invitations | Not implemented | V0.4 Team workspaces | Server-side membership, tenant authorization, invite expiry/revocation, negative cross-workspace tests |
| Projects, milestones, task dependencies | Sample projects exist; full lifecycle/dependencies are incomplete | V0.5 Planning | Project CRUD, milestone ownership, dependency cycle prevention, blocked/unblocked transitions |
| Subtasks and assignment workflow | Some UI/source capability may exist by track; AppDeploy sharing/authoritative membership not verified | V0.5 Planning | Parent-child consistency, assignment boundaries, subtasks visible in board/list/calendar |
| File attachments | Metadata references only; no file bytes stored | V0.6 Secure files | Private object storage, authorization before signed URL, size/type limits, checksum, scan, replace/delete/recovery |
| Notifications and reminders | Bell is a calendar shortcut; no delivered notifications | V0.7 Integrations | Durable outbox, idempotent delivery, retries/dead-letter, user preference/consent and duplicate suppression |
| Reports and audit history | Basic status/workload counts exist; no complete audit trail | V0.8 Insights | Metric definitions, filters, export verification, role-scoped access, redacted audit events |
| Accessibility and performance | CSS/responsive layouts exist; structured accessibility/performance baseline missing | V0.9 Quality | Keyboard-only completion, visible focus, contrast, reduced motion, mobile layout, chunk and latency budgets |
| Production operations | Blocked | V1.0 Production | Patched dependencies, secrets, migrations, backups/PITR and restore drill, alerting, rate limits, rollback, security review, privacy/retention |
| Workflow automation and AI | Planned; no production claim | V2.0 Optional automation | Explicit scoped permissions, human approval for consequential actions, idempotent jobs, audit, failure recovery and cost limits |

## Version gates and sequencing

### V0.1 — Reliability before features

- [x] Fix the proven first-render temporal-dead-zone error in AppDeploy v9.
- [x] Add local-storage access guards, React error boundary and a boot timeout recovery screen.
- [x] Re-check the real page with a browser screenshot; the Taskora shell is visible on v9.
- [ ] Execute the startup sanity workflow on the deployed revision.
- [ ] Verify mobile viewport, browser console/page errors, direct reload and storage-denied scenarios.
- [ ] Add a regression test that fails if the app root remains blank and separately asserts the recovery screen on a deliberate render failure.
- [x] Add Track B v10 source guards for snapshot task preservation, same-ID conflict rejection, existing-record preflight, and stale workspace revision detection; live E2E verification remains open.

**Exit gate:** shell renders or an explicit, actionable failure state appears; never a silent blank page. All visible routes load without uncaught page errors.

### V0.2 — A dependable personal workflow

- [ ] Verify create/edit/status/comment/delete, dates, schedule and JSON backup/restore in an actual browser.
- [ ] Make validation, conflict, loading, empty and network-error states consistent.
- [ ] Confirm scheduled tasks survive reload in both browser-local and task-cloud modes.

**Exit gate:** complete round-trip test with durable outcomes; no silent loss on a failed write.

### V0.3 — Durable persistence and recovery

- [ ] Add migration preflight/dry-run and a safe resumable migration protocol.
- [ ] Recover only orphan task records whose ownership is conclusively verified; never broad-scan/delete uncertain records.
- [ ] Verify stale revisions, pagination cursor conflicts and two-account isolation.
- [ ] Test reload, sign-out, re-authentication and browser account switching.

**Exit gate:** migration retry/conflict/recovery and account isolation pass with recorded E2E evidence.

### V0.4 — Real team collaboration and permissions

- [ ] Define a capability matrix for owner/admin/member/viewer.
- [ ] Create real workspace membership and invitations; enforce permissions on every server route.
- [ ] Test revoked membership and direct API access, not just hidden buttons.

**Exit gate:** negative cross-workspace authorization tests pass; UI role text cannot grant permissions.

### V0.5–V0.9 — Planning, integrations, insights and quality

Deliver dependencies/projects, secure attachments, notification delivery, reports/audit, then accessibility/performance budgets as separate, testable releases. Each version includes durable tests, user-facing failure/retry states and documentation.

### V1.0 — Production readiness

Require all P0/P1 data, auth, recovery, authorization, backup/restore, security, observability and rollback gates. No ready status alone can authorize production.

### V2.0 — Optional automation and AI

Only after the core product is reliable. Require bounded permissions, traceable actions, approval gates, idempotency, undo/recovery where possible, and explicit cost/privacy limits.

## Definition of done for every capability

1. The user-visible flow is inventoried and mapped to at least one test.
2. Positive path, invalid input, empty/error state and recovery path are specified.
3. Data ownership, persistence source and conflict behavior are explicit.
4. Desktop and mobile behavior are checked when layouts differ.
5. Evidence records track + revision + test identifier + expected/actual result.
6. Documentation lists remaining limitations rather than assuming them complete.
7. The whole candidate is reviewed before one planned deployment; documentation-only changes never use an AppDeploy deployment slot.

## Authoritative companions

- [AppDeploy staging status and API inventory](APPDEPLOY_STAGING.md)
- [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)
- [Final release runbook](FINAL_RELEASE_RUNBOOK.md)
- [Product and engineering audit](PRODUCT_AUDIT.md)
