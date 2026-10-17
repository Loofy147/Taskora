# AppDeploy staging port — status and implementation guide

**Reviewed:** 2026-10-17  
**App:** `taskora-ube0f6`  
**URL:** https://taskora-ube0f6.v2.appdeploy.ai/  
**Latest deployed source revision (render-checked):** `1792270506351` (v9)  
**Release state:** staging only; not approved for production use.

## Scope and identity

This application is a separate AppDeploy implementation. It is **not** a runtime deployment of the GitHub TanStack Start application, and no source synchronization exists between the two. Changes to this repo do not update AppDeploy, and AppDeploy-only changes do not appear in GitHub `main` unless intentionally ported.

The deployed staging source uses AppDeploy-managed authentication and a key-value database. Its task-level implementation stores each task in an individual database record and keeps a per-account list of task IDs on the owner-scoped workspace record. It is not a normalized PostgreSQL task schema; task comments and attachment metadata remain inside each task record.

## Current implementation inventory

| Capability | AppDeploy staging status | Required evidence |
|---|---|---|
| Board, list, calendar, project overview, team/sample data, reports | Implemented in UI | Manual smoke checks across desktop and mobile |
| Browser-local task state and JSON backup/restore | Implemented | Export/import round trip and invalid-backup rejection |
| AppDeploy sign-in | Login flow configured | Real sign-in, sign-out, refresh/re-authentication |
| Personal whole-workspace snapshot | Protected read/write with revision checks | Run upload/reload/restore and stale-revision conflict checks |
| Explicit task migration | Protected endpoint and Settings control | Successful, interrupted, resumed and conflict cases |
| Individual task list/create/update/delete | Protected endpoints with per-task revisions | Execute all CRUD flows and reload from the server |
| Deletion | Tombstone + manifest update transaction | Verify deleted task stays absent after reload |
| Account-specific local state | Browser keys scoped per account | Switch accounts in the same browser and prove no data bleed |
| Shared team workspaces/invitations | Not implemented | Separate product milestone |
| Binary file upload/download/preview | Not implemented; references only | Private object storage and access-control design |
| Delivered notifications/email digest | Not implemented | Outbox, delivery worker, retry and consent design |

## Observed deployment evidence

- **ESTABLISHED:** AppDeploy reported the last revision as `ready`.
- **EXPERIMENTALLY_SUPPORTED, limited:** the returned QA snapshot reported no frontend, backend or network errors.
- **UNKNOWN / not passed:** the status response did not include an executed E2E test result. A ready deployment is not a proof of authenticated database behavior.
- **USER_REPORTED:** account creation and some input testing were completed; a result for explicit task migration and per-task CRUD has not yet been captured.

Do not turn these observations into a production-readiness claim.

## API inventory

All routes below are defined in the AppDeploy staging source and require `requireAuth()`, except health.

| Route | Purpose | Notes |
|---|---|---|
| `GET /api/health` | Runtime health | Public health indicator, not an auth/data test |
| `GET /api/task-mode` | Inspect whether per-task mode is enabled | Must fail closed if the read is inconclusive |
| `POST /api/task-mode` | Explicitly migrate local snapshot tasks and activate per-task mode | Writes task records sequentially, then updates the manifest |
| `GET /api/tasks?cursor=...` | List tasks in bounded pages | Cursor embeds the manifest revision; stale cursor returns conflict |
| `POST /api/tasks` | Create a task | Transactionally adds task record and updates manifest |
| `PUT /api/tasks/:taskId` | Update task with `expectedRevision` | Stale revision must be rejected |
| `DELETE /api/tasks/:taskId` | Delete task with `expectedRevision` | Tombstone and index update are committed together |
| `GET /api/workspace` | Read the personal snapshot | Used before task mode is active |
| `PUT /api/workspace` | Compare-and-swap a personal snapshot | Rejected after task-level mode is active |

The migration and per-task records share the AppDeploy logical database table `taskora_workspaces`; record IDs for task entities are derived from hashes of the authenticated user ID and task ID. Never trust a client-submitted user ID to determine record ownership. Keep owner checks and auth middleware even though identifiers are derived.

## Known limitations and blockers before final release

1. **Interrupted migration cleanup is incomplete.** Migration writes task records one at a time before the owner manifest is switched to task mode. It tries to resume identical records and refuses conflicting task IDs, but an interrupted/conflicting migration can leave unindexed records. Before production approval, add a clear preflight/dry-run summary and a tested recovery path that can safely reconcile or remove only orphan records owned by the same authenticated user. Do not use broad table scans or delete records whose ownership is uncertain.
2. **Task index size and access patterns are bounded but not normalized.** The implementation supports at most 500 active tasks in one owner record; cursor/index revision changes must be tested under concurrent creation/deletion. Revisit a separate index or relational schema if the product requires larger workspaces.
3. **Conflict UX is generic.** A stale per-task write must leave local state unchanged and invite the user to refresh. Test that the UI makes this recoverable rather than silently losing the edit.
4. **E2E execution is unproven.** The stored `tests/tests.json` describes workflows, but no E2E result was returned by the last status inspection. Run it and inspect the detailed transcript before release.
5. **Local user switching needs direct browser validation.** Confirm data saved under account A is not rendered when signing into account B in the same browser, including after reload/sign-out/sign-in.
6. **Snapshot and task-level modes are not interchangeable.** Once task mode is active, full-snapshot save/restore and automatic snapshot sync are disabled. The UI should state this plainly and must not switch back automatically.

## Manual verification sequence

Use a disposable staging account or test task for destructive steps.

1. Open the live app and inspect the Deployment status panel. Confirm the API is healthy.
2. Sign into the test account and open Settings. Do **not** enable task mode until you have exported a JSON backup.
3. Confirm the snapshot revision or read-only “no saved snapshot” state is shown as expected.
4. In **Task-level cloud persistence**, review the import count and explicitly enable task-level storage. If the migration fails, stop, preserve the error, and do not repeatedly click through an unresolved ID conflict.
5. Create a task with a unique title, edit its description and status, add a comment, then refresh cloud tasks. Verify all changes remain.
6. Delete only the test task, confirm deletion, refresh again and verify it is absent.
7. In a second browser session for the same user, test stale revisions: update the same task from both sessions; the stale write must conflict and must not erase the newer server state.
8. Test account isolation with a second independent account. It must not list or read the first account's tasks. Never use a client-supplied user ID for the test.
9. Test reload, sign-out, account switch, backup export/import, invalid/oversized backup rejection, and database/network failure display.
10. Save evidence: test date, app ID, deployed revision, account roles (pseudonymous labels only), test case, expected/actual result, and any logs. Never store passwords, tokens or raw private task content in the audit note.

## Conditions for final deployment

- Resolve the interrupted-migration orphan/recovery case and update the test definitions.
- Run type/build/runtime validation and the configured E2E suite against the release candidate.
- Inspect the E2E transcript and prove create/update/delete, reload persistence, revision conflicts and account isolation.
- Review all source and documentation changes in one batch.
- Only then spend the AppDeploy deployment slot on one final candidate. After deployment, verify the exact deployed source revision, health, network/errors, browser smoke tests and E2E results.
- If any gate fails, keep the release classified as staging. Do not repeatedly redeploy one issue at a time; prepare a correction batch and redeploy only when a new complete candidate is ready.

## Forward implementation order

1. Fix and test migration preflight/recovery, including safe handling of already-existing task IDs.
2. Strengthen conflict handling and manual refresh/retry behavior for stale task index and per-task revisions.
3. Complete browser isolation/reload/migration tests; reconcile `tests/tests.json` with every user-visible backend route.
4. Decide the long-term data model: AppDeploy key-value backend for a bounded personal workspace, or GitHub Track A's PostgreSQL architecture. Do not mix their schemas or claim one validates the other.
5. Add team membership/invitations only after shared-workspace authorization design is approved.
6. Add binary storage and delivered notifications as their own secured milestones.
7. Prepare and deploy a single release candidate per the runbook.


## Blank-screen incident and recovery — 2026-10-17

### Evidence ledger

- **USER_REPORTED:** the live app stopped rendering and appeared blank.
- **EXPERIMENTALLY_SUPPORTED:** an external screenshot of v7 (revision 1792265966637) showed a blank gray canvas with no Taskora UI or loading/error message. AppDeploy still reported ready, no frontend/backend/network errors and no executed E2E result.
- **ESTABLISHED from source inspection:** an early effect had dependency array [workspace, currentUserId] at a point before the const currentUserId = currentUser?.userId declaration. Evaluating a const before initialization throws a temporal-dead-zone ReferenceError; the component therefore failed before showing the workspace. This is the identified first-render defect.
- **EXPERIMENTALLY_SUPPORTED:** v8 (revision 1792270420383) mounted the new React error boundary, which displayed “Taskora hit a rendering problem” with a reload action. That proved React entered the render-error path rather than remaining on the initial boot fallback.
- **FIX APPLIED:** v9 (revision 1792270506351) moves currentUserId above its first hook dependency use. It also retains storage-read guards, an eight-second visible boot fallback and a React error boundary with a reload action.
- **EXPERIMENTALLY_SUPPORTED after fix:** a fresh external screenshot of v9 showed the Taskora brand, sidebar, navigation, search, API indicator, statistics and task board. AppDeploy reported ready with empty frontend/backend/network error arrays.
- **UNKNOWN / OPEN:** a status response still did not provide an executed E2E result. Authenticated writes, migration recovery, persistence across reload and account isolation remain separate verification requirements.

### Required prevention

The primary sanity test must assert that the Board navigation, global search and New task control render before interacting with the app. Browser verification must capture both the page screenshot and console/page errors. The automated test suite must fail a blank-screen condition even if AppDeploy marks the deployment ready.

This incident does not establish production readiness; it establishes the recovery of the visible Taskora shell on AppDeploy v9.
