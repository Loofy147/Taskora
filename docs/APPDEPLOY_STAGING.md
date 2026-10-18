# AppDeploy staging port — status and implementation guide

**Reviewed:** 2026-10-18  
**App:** `taskora-ube0f6`  
**URL:** https://taskora-ube0f6.v2.appdeploy.ai/  
**Latest deployed source revision:** `1792327799498` (v13; Settings usability smoke-tested, authenticated E2E unverified)  
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
- **EXPERIMENTALLY_SUPPORTED, limited — v13 Settings smoke:** an unauthenticated live browser showed `Account & cloud sync` and `Local backup` as the primary visible controls, with `Advanced task storage`, `System status`, and `Feature availability` collapsed by default. The same read-only inspection did not sign in or mutate data.
- **UNKNOWN / not passed:** the status response did not include an executed E2E test result. A ready deployment is not a proof of authenticated database behavior.
- **USER_REPORTED:** account creation and some input testing were completed; a result for explicit task migration and per-task CRUD has not yet been captured.

Do not turn these observations into a production-readiness claim.

## v13 Settings usability follow-up — 2026-10-18

The deployed source revision is `1792327799498`. The Settings page now labels the primary panels `Account & cloud sync` and `Local backup`; advanced task-mode migration, system diagnostics and feature-boundary disclosures use collapsed native disclosure sections. Live unauthenticated browser inspection confirmed the disclosure sections start collapsed and all main Settings controls are visible. This is a UI/navigation smoke test only; it does not change the account-isolation, storage, migration, or production release gates.

## API inventory

All routes below are defined in the AppDeploy staging source and require `requireAuth()`, except health.

| Route | Purpose | Notes |
|---|---|---|
| `GET /api/health` | Runtime health | Public health indicator, not an auth/data test |
| `GET /api/task-mode` | Inspect whether per-task mode is enabled | Must fail closed if the read is inconclusive |
| `POST /api/task-mode` | Explicitly migrate local snapshot tasks and activate per-task mode | Merges saved and local snapshot tasks; rejects same-ID conflicts; preflights existing records; refuses activation if the workspace revision changes |
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


## Task migration data-preservation guard — 2026-10-17

- **ESTABLISHED from v10 source:** `POST /api/task-mode` merges tasks from the saved workspace snapshot and submitted local snapshot by task ID. If the same ID has different content across those sources, migration returns `409` before inserting task records.
- **ESTABLISHED from v10 source:** existing task records are preflighted before inserts; activation also checks that the saved workspace revision has not changed. A detected revision change returns `409` and leaves task-level mode inactive.
- **Deployment evidence:** revision `1792271940323` is `ready`; AppDeploy reported no frontend, backend, or network errors and produced fresh desktop/mobile QA screenshots.
- **E2E remains UNKNOWN:** the status response did not return an executed E2E result. Two migration regression cases were added to the deployed test definitions, but their presence is not evidence of execution or passage.
- **Residual risk:** an interrupted import can still leave identical, owner-scoped task records outside the active index. Retry/recovery must be executed against the deployed AppDeploy database before production approval.


## v11 hardening audit — 2026-10-18

- **ESTABLISHED from deployed source:** client backup validation now validates the complete task shape consumed by the UI, task/comment/attachment identity formats, scheduling pairs, duplicate task IDs, required project/member fields, the preference shape, item caps, and serialized-size limits. The server snapshot validator enforces the matching schema before accepting snapshots.
- **ESTABLISHED from deployed source:** signed-in local workspace keys now use an encoded account ID rather than only a 32-bit hash. Legacy-key migration is scoped to the previously recorded owner, successful scoped writes precede legacy cache cleanup, and the generic shared snapshot key is no longer duplicated for signed-in workspace writes.
- **ESTABLISHED from deployed source:** the frontend records the active identity synchronously at auth transitions and checks it around asynchronous task list, task-mode, snapshot, task-write, migration, restore, and backup-import operations. This reduces the risk that a delayed response from one account changes another account's visible UI state; it is not a substitute for two-account E2E proof.
- **Live browser smoke check:** v11 rendered the workspace shell, global search, API-online indicator, and Board/List/Calendar/Projects/Team/Files/Reports/Settings. The read-only check reported no console/page/network errors. AppDeploy also produced fresh desktop and mobile QA screenshots.
- **Test definitions:** the deployed test file has four focused workflows and exactly one `sanity: true` workflow. These are test definitions, **not** evidence of executed E2E passage.
- **UNKNOWN / OPEN:** AppDeploy still did not return an executed E2E result. Sign-in/out, malformed backup rejection in the browser, delayed-request account switching, cloud persistence, task CRUD, migration retry/recovery, stale-write conflicts, and independent-account isolation still require executed results. Production approval remains blocked.

### Remaining product boundaries found in the audit

- Team role/responsibility fields are sample/local workspace data, not real memberships or server-enforced permissions.
- Files lists names and metadata only. Binary upload, download, access-controlled sharing, preview, and malware scanning are not implemented.
- Reports are derived from the current workspace snapshot and seeded sample data, not external analytics.
- Delivered reminders/email notifications and production backup/restore operations are not implemented or verified.
- Track A, the GitHub React/TanStack application, remains a separate implementation and is still configured as a preview with auth and database provisioning disabled. The AppDeploy release does not synchronize Track A.


## Follow-up live verification — 2026-10-18

Against the live v11 revision `1792325012924`, a read-only API check used the embedded client API base (`api-v2.appdeploy.ai/app/taskora-ube0f6`): `GET /api/health` returned `200 application/json`; unauthenticated `GET /api/task-mode`, `GET /api/tasks`, and `GET /api/workspace` each returned `401 application/json`. Repeating those protected GETs with a deliberately invalid bearer token also returned `401 application/json`. No write routes were called in these API-boundary checks.

In a separate unauthenticated audit-browser profile, an incomplete schema-v1 workspace backup was rejected and all eight original sample tasks remained unchanged. A unique temporary local task was created with due date 2026-10-19 and time range 09:30–10:00, verified after reload in Calendar, then deleted; after reload the original eight sample tasks remained. These checks validate anonymous auth denial, malformed-import rejection, and browser-local CRUD/scheduling only.

**Still OPEN:** the remote browser has no authenticated Taskora session. The two existing user accounts were not accessed. Cross-account isolation, authenticated cloud snapshot persistence, per-task cloud CRUD, migration/retry/conflict recovery, and delayed-response behavior remain unverified until those existing accounts can be used in an authorized browser session. No valid token or account credentials were available or requested.


## v12 relational-integrity follow-up — 2026-10-18

- **Deployed source:** revision `1792326417562` is `ready`; fresh desktop/mobile QA screenshots were generated and the QA snapshot reports no frontend, backend or network errors.
- **ESTABLISHED — source:** client and server snapshot validation reject duplicate project/member IDs, duplicate comment/attachment IDs within a task, and tasks whose project or assignee does not exist. Task-level create/update routes check project and assignee references; task listing fails closed for orphaned stored references. Individual task API responses are validated separately from whole-workspace relationship checks.
- **ESTABLISHED — live browser:** malformed backup containing duplicate project IDs was rejected; a backup with a dangling project/assignee reference was rejected; duplicate comment-ID and duplicate attachment-ID backup payloads were rejected. The original eight sample tasks remained intact after these attempts. (A duplicate-member payload was attempted, but its browser automation result was not conclusive; the source validator check is established.)
- **ESTABLISHED — live API boundary:** `GET /api/health` returned `200 application/json`; anonymous and deliberately invalid bearer-token requests to `GET /api/task-mode`, `GET /api/tasks`, and `GET /api/workspace` returned `401 application/json`.
- **UNKNOWN / OPEN:** authenticated testing with the two existing accounts has not been performed because the browser session available to the audit is logged out and does not expose a user-controllable session link. Account A/B isolation, authenticated snapshots, task migration, cloud CRUD, and delayed-response switching remain release gates. No production approval.
