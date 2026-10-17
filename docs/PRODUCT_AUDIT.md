# Taskora product and engineering audit

**Audit date:** 2026-10-17  
**Evidence boundary:** the GitHub repository `Loofy147/Taskora` and its CI history. Historical pre-import observations are retained below and explicitly marked as superseded where the repository has since changed. The separate AppDeploy staging port is audited independently in [`APPDEPLOY_STAGING.md`](APPDEPLOY_STAGING.md); evidence from that app is not evidence that repository `main` is deployed.

## Post-import baseline verification — 2026-10-17

**Repository:** `Loofy147/Taskora`; default branch `main`; baseline commit `cf60790b9dd6340a2c699336f9233c1ee715121d`.

- **ESTABLISHED:** `main` points to the source-population commit; the complete application tree is present at the repository root.
- **ESTABLISHED:** `.taskora-import/` and `.github/workflows/import-taskora-source.yml` are absent from the current tree.
- **EXPERIMENTALLY_SUPPORTED:** [GitHub Actions run 39053827997](https://github.com/Loofy147/Taskora/actions/runs/39053827997) completed successfully for that exact SHA; `npm test`, typecheck, lint, and production build all passed.
- **KNOWN LIMITATION:** lint reported 6 warnings (five Fast Refresh export-boundary warnings and one unused variable). The client build emitted a 701.08 kB chunk (190.83 kB gzip) and a 431.89 kB chunk (135.53 kB gzip); the large-chunk warning was not suppressed or treated as a build failure. These are measurements of the pre-cleanup baseline and must be re-measured for later commits.
- **NOT VERIFIED:** the migration runner skipped because `DATABASE_URL` was absent. No live PostgreSQL migration, deployed authentication flow, browser QA, or two-account isolation test is established by this CI run.


## Workspace storage integration revalidation — 2026-10-17

- **EXPERIMENTALLY_SUPPORTED:** commit [`52a2b84`](https://github.com/Loofy147/Taskora/commit/52a2b841294e95a3121300a8c72f664434e33d40) adds six server-storage integration scenarios against an isolated embedded PGlite database. [Post-merge CI run 39056875032](https://github.com/Loofy147/Taskora/actions/runs/39056875032) passed the scripted suite, application/unit/integration suite, typecheck, lint, and build.
- Covered outcomes: read-only inspection, snapshot initialize/load round-trip, isolation of different server-supplied user identities, cross-account write denial, one-winner concurrent initialization, compare-and-swap concurrent writes, event consistency, invalid snapshot rejection, and the shared-demo-identity guard.
- **SCOPE LIMIT:** these tests exercise the storage service with distinct user IDs; they do not simulate a real Better Auth login, a browser session, or a live database provider. The test file fails immediately if `DATABASE_URL` is set, so CI cannot accidentally write to a configured staging/production database.
- **NOT VERIFIED:** applying migrations to live PostgreSQL, real OAuth/session lifecycle, browser upload/load/restore, or end-to-end two-account isolation through deployed HTTP endpoints. Those remain the open Gate 1B exit criteria.

## Historical findings from the initial audit

The source-import finding below describes the repository state before commit `cf60790`. It is preserved as an audit trail, not as the current repository state.

### Historical P0 — The application source had not yet been imported (RESOLVED)

**Historical status:** this was accurate before commit `cf60790`, when the remote contained only the temporary bootstrap transport.

**Resolution:** commit `cf60790` populated the source tree, removed the transport files and importer workflow, and passed the normal CI workflow on the exact source SHA. See the post-import baseline verification above.

### P1 — Task data is still local-first; the snapshot backend is an explicit bridge

**Status:** EXPERIMENTALLY_SUPPORTED for the dependency-free validation layer; full app/backend integration is not yet verified. `src/lib/store.ts` still persists the working state to Zustand/localStorage. New `src/lib/workspace-data.ts` server functions use the existing `authMiddleware`; `src/lib/workspace-storage.server.ts` scopes a personal snapshot to the server-verified user, validates payloads against the backup schema, and uses revision compare-and-swap so stale tabs cannot silently overwrite a newer snapshot. `src/lib/workspace-sync.ts` adds explicit opt-in upload/download, debounced sync, and conflict detection. `migrations/0001_workspace_storage.sql` adds workspace owner-membership, JSONB snapshot and event tables. A fail-closed guard rejects the shared demo identity mode (`VITE_AUTH_ENABLED=false`).

**Impact / limitation:** this bridge provides one personal whole-workspace snapshot per authenticated account; it is not task-level CRUD, multi-user team sharing, real-time collaboration, or a tested production data layer. The shipped `.grok/app-env.json` has auth/database provisioning disabled, so the bridge intentionally remains unavailable by default.

**Required action:** provision real authentication and PostgreSQL in deployment, run the migration in a safe environment, then test upload/download/reload, stale revision conflict, two-account isolation, database failure and reauthentication before making cloud sync available to users.

### P1 — Identity and invitations are placeholders

**Status:** FACT / ESTABLISHED. `src/lib/types.ts` defines `ME = "hichem"`; `src/lib/seed.ts` adds named sample users; `addMember` in `src/lib/store.ts` only appends an object to local state. `TeamView` has no invitation workflow and cannot establish membership for an actual account.

**Required action:** bind the current user to a real session; add workspaces, membership roles, invitation state and server-side authorization. Use the minimum roles necessary (owner/admin/member/viewer) and test cross-workspace access denial.

### P1 — Attachments are references, not files

**Status:** FACT / ESTABLISHED. `addAttachment` in `src/lib/store.ts` stores only `file.name`, formatted byte size, and a category inferred from the filename. File bytes are not stored or uploaded; the file list has no download/preview URL.

**Impact:** users could infer that documents are available to teammates when only metadata exists.

**Action applied:** changed the interface copy to call these “file references” and disclose that file contents are not uploaded or shared. Production implementation still requires authorized object storage and file access controls.

### P1 — Business data has no server-managed recovery path

**Status:** FACT / ESTABLISHED. The app still persists to browser storage; browser profile reset, site-data clearing, or device loss can remove locally stored changes. The current source now includes a validated JSON export/restore workflow, but it is user-managed, unencrypted, and not a server-side backup or audit history.

**Action applied:** added versioned local export/restore with explicit restore confirmation and fail-closed validation, plus an initial opt-in JSONB snapshot store with a monotonic revision and write-event ledger. Inspection is read-only and opening Settings does not create a server workspace. Details and limitations are documented in `docs/WORKSPACE_BACKUP_FORMAT.md`.

**Required action:** deploy PostgreSQL with verified auth, add automated backups/retention and a tested restore runbook, then evolve the snapshot bridge to normalized task/project/comment operations. Treat local JSON backup as the independent recovery fallback.

### P2 — Invalid/missing due dates were treated as overdue

**Status:** FACT / ESTABLISHED from code inspection. `isOverdue` compared the due-date string lexicographically to today's key without validating the input; an empty string sorts before an ISO date and could be counted as overdue. The new-task form also did not require a date.

**Action applied:** added an ISO calendar-date validator, made invalid date formatting safe, ensured invalid/missing task due dates fall back to today in the store, marked the title and due-date fields as required, and added focused regression tests in `src/lib/format.test.ts`.

### P2 — Browser and live-service behavior remain unverified

**Status:** `UNKNOWN` for full browser interaction and live-service integration. The post-import CI run verifies automated tests, TypeScript, lint, and a production build at commit `cf60790`; it does not establish browser QA, a live PostgreSQL migration, or production authentication and isolation. Earlier local-environment limitations are recorded below.

**Action applied:** added due-date and workspace-backup regression tests. At the original local-audit stage, the dependency-free test group passed 224/224 while dependency installation was incomplete. Later, [CI run 39053827997](https://github.com/Loofy147/Taskora/actions/runs/39053827997) passed the configured `npm test`, typecheck, lint, and production build on baseline commit `cf60790`. That baseline run did not include browser QA or live-backend tests; later code revisions require their own CI evidence.

### P2 — Bundled preview screenshots show the previous brand

**Status:** FACT / ESTABLISHED. The supplied preview PNGs still display “TaskFlow Pro,” while the app wordmark and metadata now use Taskora. These screenshots are non-runtime artifacts, but they can mislead design review or onboarding.

**Required action:** regenerate preview screenshots after dependencies are installed and the app can be run in a browser; do not treat the old screenshots as evidence of the current UI.

### P2 — Product naming was not consistent

**Status:** FACT / ESTABLISHED. User-visible branding, page title, seeded email domain, and package metadata still said TaskFlow Pro / `taskflow.pro` while the repository and product choice are Taskora.

**Action applied:** updated the visible wordmark and page title to Taskora, changed seeded emails to non-product placeholder addresses, and renamed package metadata to `taskora`. Kept the old local-storage key unchanged to avoid silently abandoning existing browser data; it can be migrated deliberately when the state model changes.

## Historical local-workspace verification (before remote CI passed)

- **Passed:** `node --experimental-strip-types --test 'scripts/**/*.test.mjs'` — 224 tests passed, 0 failed.
- **Passed:** real seeded workspace backup smoke test — 15 tasks, 6 projects, 6 members, 4 notifications validated and round-tripped.
- **Blocked:** full `npm test` — npm registry requests failed with `EAI_AGAIN`; `@tanstack/react-start/server`, `jose`, and `date-fns` are missing from the partial `node_modules` tree. The dependent test cases cannot load, so the full command is not green.
- **Not verified:** TypeScript check, ESLint, production build, browser interaction tests, deployment, database integration, authentication, real-time collaboration, or cross-user authorization.

## Recommended delivery order (updated after repository import)

1. Keep the repository import gate complete and require CI evidence for each subsequent code revision; do not reintroduce temporary transport artifacts.
2. Choose a real deployment target, auth strategy, database, and object storage. Preserve the current UI but label unsupported operations until wired.
3. Implement workspaces, membership, verified identity, access-controlled task/project CRUD, comments, and activity history in the server layer; stop treating local storage as the source of truth.
4. Add invitations, upload/download, real notifications, and email digests only after authorization and durable persistence are in place.
5. Add integration tests covering two users in one workspace, two separate workspaces, forbidden cross-workspace reads/writes, attachment authorization, failure/retry behavior, and concurrent updates.
6. Run browser QA at mobile and desktop sizes, then deploy and re-check the deployed build and database schema.

## Revalidation addendum — 2026-10-17 (historical archive-recovery record)

**Exact uploaded input:** `taskora-fixed-workspace.zip`  
**Input SHA-256:** `15a2ad903d01e9b321d02afb74ff222e9bbbd80269627deba8234cf0b8d17204`  
**Input archive check:** `unzip -t` completed without errors; extraction contained 203 files. The archive was approximately 1.1 MB, not the 769 KB stated in the accompanying status note.

**Correction applied in this revised local workspace:** the uploaded archive did not contain `.github/`, so claims that a CI workflow, Dependabot configuration, and issue templates were included were not true of the actual input. Added `.github/workflows/ci.yml`, `.github/dependabot.yml`, bug and feature issue templates, issue-template security guidance, `SECURITY.md`, and dependency-free repository-configuration regression tests. The workflow uses SHA-pinned `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0, installs from the lockfile, and runs tests, typecheck, lint, and a production build. The action versions were checked against the official [actions/checkout releases](https://github.com/actions/checkout/releases) and [actions/setup-node releases](https://github.com/actions/setup-node/releases) on 2026-10-17. The normal CI and repository-hygiene configuration were committed in the complete source import. The temporary importer workflow and base64 transport artifacts were removed by commit `cf60790`; the exact commit's CI run is verified in the post-import baseline section above.

**Historical local verification boundary:** `node --test 'scripts/**/*.test.mjs'` passed all dependency-free tests in the revised workspace (224/224). The local dependency installation attempt did not complete in that environment, so the full TypeScript-import test phase could not load `@tanstack/react-start`, `jose`, and `date-fns`. This describes that local attempt only; the later remote CI run passed the complete configured test, typecheck, lint, and build stages. Browser QA and live backend integration remain unverified.

**Historical bootstrap note — superseded:** the original direct tree creation failed against an empty repository, so a temporary bootstrap and 61 transport chunks were staged. That temporary arrangement was only an intermediate import technique. It was superseded by commit `cf60790`, which published the complete source tree and removed the transport and importer workflow.


## Implementation revalidation — workspace recovery (historical local-workspace record)

**Date:** 2026-10-17  
**Status:** `EXPERIMENTALLY_SUPPORTED` for the dependency-free validation module; UI/typecheck/browser behavior remains `UNKNOWN` until the complete dependency install and browser QA run.

Implemented in the local source workspace:

- `src/lib/workspace-backup.ts` defines `taskora.workspace-backup` version 1, enforces a 10 MiB bound, validates collection shapes and enums, rejects duplicate IDs and invalid calendar/timestamp values, checks task/project/member/comment/notification references, and fails closed on unknown schema versions.
- Settings can export a JSON snapshot and stage a restore. The restore is not applied until the user confirms the replacement. Import does not execute imported code; it parses JSON and validates it before applying state.
- The backup includes tasks, projects, members, notifications, and settings. It includes attachment metadata only—not file bytes—and is not encrypted.
- The state replacement clears transient selection/filter/panel state so it does not point at records from the previous dataset. Backup actions remain disabled until browser persistence hydration finishes, preventing an early export from capturing the unhydrated seed state.
- `formatStamp` now returns `Unknown date` instead of throwing on malformed persisted timestamps.
- `scripts/workspace-backup.test.mjs` covers valid round trips, malformed JSON, foreign format, unknown versions, impossible dates, duplicate IDs, missing relationships, the required local profile, the size limit, and malformed settings.

**Verification run:** `node --experimental-strip-types --test 'scripts/**/*.test.mjs'` — **224 tests passed, 0 failed**. An isolated strict TypeScript check passed for `workspace-backup.ts` and the domain types; this is not the whole-app typecheck. The real seeded dataset was also passed through the backup generator and parser in a smoke test: 15 tasks, 6 projects, 6 members, 4 notifications, 18,902 bytes; validated successfully. The historical local attempt could not complete TypeScript-import tests because `npm ci` did not complete and `@tanstack/react-start`, `jose`, and `date-fns` were absent in that environment. Later remote CI at commit `cf60790` passed the configured tests, typecheck, lint, and production build. Browser QA and live backend integration remain open.

This reduces prototype data-loss risk but does **not** change the architecture boundary: the app remains browser-local, unauthenticated by default, and unsuitable for shared sensitive business records until server-side authentication, workspace authorization, and PostgreSQL persistence are implemented and tested.


## Next implementation frontier — after repository hygiene

1. **Authenticated PostgreSQL gate:** provision real deployment authentication and a durable `DATABASE_URL` through the platform secret store, then apply the migration in a controlled staging database.
2. **Integration evidence:** exercise snapshot create/upload, load after reload, explicit restore, stale-revision conflict, database failure, sign-out and reauthentication. Test two independent accounts and prove cross-account read/write isolation.
3. **Domain model:** evolve the personal snapshot bridge into authorized per-entity operations for workspaces/memberships, tasks/projects, and then comments/subtasks/attachments metadata.
4. **Operational readiness:** add browser QA, database backup and restore drills, retention rules, rate limiting, structured redacted logs, and deploy/rollback checks before calling the product production-ready.

Do not enable cloud sync in a customer deployment until the auth/database, concurrency, restore, failure-recovery, and two-account isolation gates pass.


## Separate AppDeploy staging port — release-preparation review (2026-10-17)

### Evidence ledger

- **ESTABLISHED:** AppDeploy app `taskora-ube0f6` has a live URL: [https://taskora-ube0f6.v2.appdeploy.ai/](https://taskora-ube0f6.v2.appdeploy.ai/).
- **ESTABLISHED:** deployed source revision `1792264284898` is reported as `ready`.
- **EXPERIMENTALLY_SUPPORTED, limited:** the corresponding AppDeploy QA snapshot reported no frontend, backend or network errors. The status API returned no executed E2E test result; this is not an end-to-end pass.
- **USER_REPORTED:** the user created an account and tried some inputs. The specific persistence migration, task CRUD, account-isolation and conflict outcomes have not been recorded.
- **ESTABLISHED:** the AppDeploy source contains auth-protected routes for task mode, per-task list/create/update/delete and the existing personal snapshot bridge. This is a separate staging codebase using the AppDeploy managed database, not this repository's Better Auth/PostgreSQL implementation.
- **OPEN:** full migration recovery behavior, concurrent mutations, reload persistence, explicit two-account isolation, signed-out local data separation and recovery from stale pagination cursors need evidence from dedicated test runs.

### Corrective documentation rule

When describing Taskora, always label which track a statement applies to. Do not describe AppDeploy's task endpoints as code present in GitHub `main`, and do not describe this repository's PGlite tests as proof of the live AppDeploy database. The deployment/readiness status, browser checks, and source ref must be recorded independently for each track.


## AppDeploy blank-screen incident and recovery — 2026-10-17

This record supplements (and does not replace) the separate-track audit above.

- **USER_REPORTED:** the AppDeploy staging app appeared to stall with rendering stopped.
- **EXPERIMENTALLY_SUPPORTED:** v7 (1792265966637) screenshot was blank; the AppDeploy status API still said ready with empty runtime error arrays and no returned E2E execution result.
- **ESTABLISHED from source inspection:** the first useEffect dependency array evaluated currentUserId before its const declaration, a deterministic JavaScript temporal-dead-zone ReferenceError during React component rendering.
- **FIX:** v9 (1792270506351) moves the declaration ahead of its first use and includes browser-storage guards, a visible boot timeout recovery panel and a React error boundary.
- **EXPERIMENTALLY_SUPPORTED:** a fresh external screenshot of v9 showed the workspace shell, search, sidebar and task board; AppDeploy status is ready and reported no frontend/backend/network errors.
- **OPEN:** no executed E2E result was returned. Do not promote this render-level recovery into a claim that cloud persistence, task migration, account isolation or production readiness is verified.

Prevention actions are listed in [the final release runbook](FINAL_RELEASE_RUNBOOK.md), and the full target sequence is in [the version/capability matrix](VERSION_CAPABILITY_MATRIX.md).
