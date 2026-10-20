# Taskora final release runbook

**Purpose:** finish implementation, documentation and verification before using a limited AppDeploy deployment allowance.  
**Policy:** a deployment is a release-stage operation, not a development save. Do not deploy after every code edit.

## 1. Source-of-truth selection

Before each task, record which implementation is being changed:

- **GitHub source:** `Loofy147/Taskora`, branch/ref/commit, React/TanStack Start, Better Auth and PostgreSQL/PGlite.
- **AppDeploy staging port:** app ID `taskora-ube0f6`, current deployed source revision `1792339899173` (v16 local-first reliability batch; cloud snapshot/task-level persistence deferred; E2E verdict not returned), AppDeploy auth and managed key-value database.

These are separate artifacts. A CI result on GitHub is not an AppDeploy E2E result. An AppDeploy-ready status is not a GitHub source deployment, a real PostgreSQL migration, or a production gate pass.

## 2. Development without consuming a deployment

1. Inspect the current source snapshot and baseline before editing; record its exact ref/revision.
2. List the user-visible workflows affected by the change. Link each workflow to a test in `tests/tests.json` or the repository's automated tests.
3. Batch related source edits, docs and regression definitions. Keep one coherent candidate rather than deploying between edits.
4. Perform static checks, type checking, lint, unit/contract tests and build checks that do not require a live deploy. Use the connected GitHub repository and branch to persist/review repository work.
5. Audit the diff for accidental environment, auth, data-loss and compatibility changes. Confirm docs reflect actual routes, schemas, limits, error behavior and evidence.
6. Prepare the final QA script and expected outcomes before a live run.
7. Do not call AppDeploy's deploy operation for documentation-only changes or for changes that can be verified statically.

**Constraint:** the current AppDeploy integration persists source changes through its deployment operation; it does not expose a separate unpublished editing workspace. Therefore, AppDeploy code changes should be prepared as one batch and deployed only when the candidate is complete. GitHub documentation changes can be reviewed on a branch/PR without deploying the AppDeploy application.

## 3. Preconditions for the single final deployment

All items below must be checked before consuming the deployment slot:

- [ ] Source branch/ref/revision and intended target app are recorded.
- [ ] User-visible capability map and test definitions match the candidate.
- [ ] Type/build/lint/test checks are green, or every known exception is explicitly accepted and scoped.
- [ ] Migration is safe, idempotent, retryable, and has an ownership-safe interrupted-state recovery path.
- [ ] Authenticated endpoints reject unauthenticated access and verify record ownership on every operation.
- [ ] Account switching cannot display or write another account's local or remote data.
- [ ] Concurrent/stale writes return explicit conflict results without overwriting newer data.
- [ ] Backup/export/restore paths are documented and tested.
- [ ] All unsupported features remain clearly labeled as unavailable.
- [ ] E2E script is prepared; the deployment will be followed by test execution and transcript review.
- [ ] A rollback/recovery decision is written down before deployment.
- [ ] No new deploy is requested merely to inspect styling or make a cosmetic adjustment.

## 4. Required final browser run — current v16 local-first build

Use disposable tasks and run desktop and mobile checks:

1. App shell renders: brand, Board/List/Calendar/Projects/Team/Files/Reports/Settings navigation, search and New task.
2. Create → edit → change status → comment → reload; verify local task and activity state remain available.
3. Validate invalid title/date, oversized description/tag/comment, too many tags, incomplete time pairs and end time before start; rejected input must not change workspace state.
4. Create timed tasks with overlapping dates/times/assignees. Verify the collision identifies the existing task; cancel prevents the write, while explicit confirmation allows the overlap.
5. Apply combined search, status and priority filters; Clear filters restores the full result set.
6. Edit a sample role and responsibility field and reload. Treat these as local user-maintained fields, not authorization or real team membership.
7. Export a JSON backup, import it after confirmation, and verify a valid round-trip. Reject malformed and oversized files without replacing the current workspace.
8. Confirm task deletion requires confirmation and leaves no stale row after the state update.
9. Inspect page errors, network failures, QA snapshot, exact source revision and the actual E2E transcript. A `ready` deployment or empty error list is not an E2E pass.

### Optional gates if cloud persistence is reactivated in a future candidate

Do not run the current cloud UI as if it were supported: v16 explicitly defers snapshot upload/restore, auto-sync and task-level cloud activation. Any future reactivation requires a separate candidate that proves authenticated snapshot read/write/restore, per-task CRUD, stale revision conflicts, interrupted migration recovery, and two-account isolation. Use separate authorized test accounts and never ask for or store passwords, cookies, tokens or private task payloads in the audit record.

## 4A. Current local integrity and account-boundary checks

- [ ] Import malformed JSON missing required task fields, duplicate IDs or broken project/member references; verify it is rejected and the workspace is unchanged.
- [ ] Test valid and oversized backup files; verify nested records, time-pair validity, item caps and explicit restore confirmation.
- [ ] Test task title/description/tag/comment limits and calendar date/time validation.
- [ ] Test schedule conflict cancellation and explicit override paths.
- [ ] Test List filter combinations and Clear filters on desktop/mobile.
- [ ] Test browser storage denied/throws behavior, sign-out cleanup and account-scoped local keys.
- [ ] Treat cloud auth, persistence and account A/B tests as reactivation gates—not as features of the current v16 local-first build.
- [ ] Preserve the E2E transcript and mark every item PASS/FAIL/NOT RUN; test definitions alone do not satisfy this gate.

## 5. Post-deployment acceptance record

Record:
- UTC timestamp and local date;
- app ID and public URL;
- deployed source revision;
- CI/test/build identifiers;
- E2E status and link/transcript;
- manual cases passed/failed/not run;
- database/migration evidence;
- auth and isolation outcome (use account labels A/B, never emails/secrets);
- known limitations and rollback/recovery decision.

A deployment marked `ready` with an empty error list is not enough. The final gate requires an executed E2E result plus the manual security/persistence checks above.

## 6. Release decision

- **PASS:** all mandatory gates pass; record evidence and publish the release state.
- **CONDITIONAL:** no data/security gate is failing, but a non-critical test is pending; remain staging and document the exception.
- **FAIL / HOLD:** migration ambiguity, unverified ownership, cross-account access, stale-write data loss, unknown write outcome, missing E2E evidence, or unresolved restore problem. Do not declare production-ready.


## 7. Blank-screen / frontend-startup acceptance gate

The 2026-10-17 incident showed that AppDeploy can report ready with an empty error list while the browser renders a blank screen. This section is mandatory for every release candidate.

- [ ] Confirm the exact AppDeploy source revision and version are recorded.
- [ ] Wait for startup completion, then capture desktop and mobile screenshots from a fresh browser session.
- [ ] Verify the normal Taskora shell is visible: brand, navigation, page heading, search, New task action and primary workspace content.
- [ ] Verify #root is populated with the app shell; if startup fails, a loading/recovery state must be visible instead of a silent blank canvas.
- [ ] Check JavaScript console/page errors and failed JS/CSS/API requests, not only AppDeploy's server-side error summary.
- [ ] Exercise direct URL load and reload; verify a blocked browser-storage API does not prevent the shell from mounting.
- [ ] Verify the sanity E2E test includes a render assertion before any interaction; inspect the actual executed result/transcript.
- [ ] Verify an injected render failure displays the error boundary and Reload action; verify the normal case dismisses the boot fallback.
- [ ] Record screenshot review, console result, test run ID and source revision in the release evidence.

**Hold rule:** if the normal shell is missing in a screenshot, the sanity E2E result is absent/failed, or page errors remain unexplained, status is **FAIL / HOLD** even when deployment status says ready.


## v11 live smoke record — 2026-10-18

- [x] Public health route returns JSON success.
- [x] Protected task-mode, task-list and workspace GETs reject anonymous requests with HTTP 401.
- [x] The same protected GETs reject a deliberately invalid bearer token with HTTP 401.
- [x] Malformed workspace backup is rejected without changing existing local sample tasks.
- [x] Temporary local task persists across reload with a 2026-10-19 09:30–10:00 schedule, then is deleted; original sample tasks remain.
- [ ] Sign in with each of the two existing Taskora accounts and record account identity without exposing tokens or other secrets.
- [ ] Prove account A cannot read or mutate account B data; exercise delayed responses during account switching.
- [ ] Verify authenticated cloud snapshot save/restore, task migration, retry/reconciliation, per-task CRUD, and revision conflicts.

The remote browser used for the recorded smoke checks was unauthenticated. These green checks do not replace the three open authenticated checks above; production remains on HOLD.


## v12 integrity verification record — 2026-10-18

- [x] Source-level client/server validation rejects duplicate project/member IDs and duplicate nested comment/attachment IDs.
- [x] Source-level snapshot checks and task-level API checks enforce valid project/assignee references.
- [x] Live backup import rejected duplicate-project IDs, dangling task references, duplicate comment IDs and duplicate attachment IDs; original eight sample tasks remained unchanged.
- [x] Live API boundary: health returned 200 JSON; protected task-mode/tasks/workspace reads returned 401 JSON with no token and with an invalid bearer token.
- [ ] Authenticated E2E using both existing accounts: sign in A/B, verify no cross-account reads/writes, and test switching while requests are delayed.
- [ ] Authenticated snapshot round-trip, task-level migration recovery, per-task CRUD, and stale-revision conflict handling.

The remote browser used by this audit is logged out and has no user-controllable session link, so authenticated two-account tests remain OPEN. v12 is staging-verified only; production remains on HOLD.


## v13 Settings usability smoke — 2026-10-18

- **Revision:** `1792327799498` (AppDeploy Track B).
- **Observed:** a read-only unauthenticated browser inspection reached Settings. `Account & cloud sync` and `Local backup` are visible. `Advanced task storage`, `System status`, and `Feature availability` are collapsed by default; their contents remain accessible through disclosure controls.
- **Platform status:** AppDeploy reported `ready` with empty frontend, backend and network error lists. No executed E2E result was returned.
- **Release implication:** this is UI smoke evidence only. Authenticated task CRUD, snapshot round-trip, migration recovery, stale-revision conflicts and two-account isolation remain open. Do not use this as production approval.


## v14 cloud-status correctness check — 2026-10-18

The current AppDeploy Track B revision is `1792338457910`. The client no longer equates a default revision value of zero with a successful empty-cloud response: it renders `Unknown` until the latest authenticated workspace read succeeds. The Settings UI now orders account sync and local backup before advanced task storage. A fifth QA test defines a simulated 503 for `GET /api/workspace`; the live deployment status is ready and the unauthenticated Settings smoke check passed, but no executed E2E result was returned. Authenticated cloud persistence and A/B isolation remain release blockers.


## v16 local-first release note — 2026-10-18

- **AppDeploy Track B revision:** `1792339899173` (ready).
- **QA status:** returned snapshot reports no frontend/backend/network errors; no executed E2E verdict was returned, so the current workflows are not yet E2E-verified.
- **Current supported path:** browser-local tasks plus JSON export/import. The deployed UI disables/defer cloud snapshots, auto-sync and task-level cloud storage until a separate authenticated end-to-end candidate is justified and verified.
- **Changed behavior:** stricter task title/description/date/time/tag/comment bounds; a confirmation warning for overlapping timed tasks for the same assignee/date; List filters for status and priority plus Clear filters.
- **Release decision:** staging only. Complete the local-first E2E acceptance checks before calling the current workflow verified. Reopening cloud persistence is optional and must not be inferred from backend routes still present in source.
- **Deployment-capacity:** this document update is documentation-only and does not require another AppDeploy deployment.
