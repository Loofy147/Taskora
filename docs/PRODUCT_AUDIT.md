# Taskora product and engineering audit

**Audit date:** 2026-10-17  
**Evidence boundary:** uploaded `grok-workspace.zip` plus GitHub repository metadata for `Loofy147/Taskora`. The public GitHub repository was confirmed empty during this audit. No deployed runtime or production database was available to inspect.

## Findings

### P0 — The application source has not yet been imported

**Status:** ESTABLISHED at the last remote read. `main` contains a temporary bootstrap commit and a staged base64 source transfer under `.taskora-import/`, but it does not yet contain the extracted application tree. The bootstrap workflow requires an authenticated GitHub Actions dispatch; the application should not be treated as present in the repository until that workflow succeeds and the temporary transport files disappear.

**Required action:** authorize the repository write/Actions connection, dispatch `.github/workflows/import-taskora-source.yml`, verify the extracted root tree and imported commit, then require the normal `ci.yml` result against that source commit.

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

### P2 — Full application behavior remains unverified

**Status:** `UNKNOWN` for a full build/runtime. There are now focused Taskora regression tests for due dates, product boundaries, backup serialization, malformed imports, and reference integrity. The dependency-free suite is green, but missing installed packages prevent the TypeScript-dependent tests and full application checks from running here.

**Action applied:** added due-date and workspace-backup regression tests. The current dependency-free test group passes 224/224; this is not a substitute for the full `npm test`, typecheck, lint, build, and browser QA.

### P2 — Bundled preview screenshots show the previous brand

**Status:** FACT / ESTABLISHED. The supplied preview PNGs still display “TaskFlow Pro,” while the app wordmark and metadata now use Taskora. These screenshots are non-runtime artifacts, but they can mislead design review or onboarding.

**Required action:** regenerate preview screenshots after dependencies are installed and the app can be run in a browser; do not treat the old screenshots as evidence of the current UI.

### P2 — Product naming was not consistent

**Status:** FACT / ESTABLISHED. User-visible branding, page title, seeded email domain, and package metadata still said TaskFlow Pro / `taskflow.pro` while the repository and product choice are Taskora.

**Action applied:** updated the visible wordmark and page title to Taskora, changed seeded emails to non-product placeholder addresses, and renamed package metadata to `taskora`. Kept the old local-storage key unchanged to avoid silently abandoning existing browser data; it can be migrated deliberately when the state model changes.

## Verification performed on the current local workspace

- **Passed:** `node --experimental-strip-types --test 'scripts/**/*.test.mjs'` — 224 tests passed, 0 failed.
- **Passed:** real seeded workspace backup smoke test — 15 tasks, 6 projects, 6 members, 4 notifications validated and round-tripped.
- **Blocked:** full `npm test` — npm registry requests failed with `EAI_AGAIN`; `@tanstack/react-start/server`, `jose`, and `date-fns` are missing from the partial `node_modules` tree. The dependent test cases cannot load, so the full command is not green.
- **Not verified:** TypeScript check, ESLint, production build, browser interaction tests, deployment, database integration, authentication, real-time collaboration, or cross-user authorization.

## Recommended delivery order

1. Complete authorization and run the staged importer; verify the extracted application tree and normal CI result before pushing further application changes.
2. Choose a real deployment target, auth strategy, database, and object storage. Preserve the current UI but label unsupported operations until wired.
3. Implement workspaces, membership, verified identity, access-controlled task/project CRUD, comments, and activity history in the server layer; stop treating local storage as the source of truth.
4. Add invitations, upload/download, real notifications, and email digests only after authorization and durable persistence are in place.
5. Add integration tests covering two users in one workspace, two separate workspaces, forbidden cross-workspace reads/writes, attachment authorization, failure/retry behavior, and concurrent updates.
6. Run browser QA at mobile and desktop sizes, then deploy and re-check the deployed build and database schema.

## Revalidation addendum — 2026-10-17

**Exact uploaded input:** `taskora-fixed-workspace.zip`  
**Input SHA-256:** `15a2ad903d01e9b321d02afb74ff222e9bbbd80269627deba8234cf0b8d17204`  
**Input archive check:** `unzip -t` completed without errors; extraction contained 203 files. The archive was approximately 1.1 MB, not the 769 KB stated in the accompanying status note.

**Correction applied in this revised local workspace:** the uploaded archive did not contain `.github/`, so claims that a CI workflow, Dependabot configuration, and issue templates were included were not true of the actual input. Added `.github/workflows/ci.yml`, `.github/dependabot.yml`, bug and feature issue templates, issue-template security guidance, `SECURITY.md`, and dependency-free repository-configuration regression tests. The workflow uses SHA-pinned `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0, installs from the lockfile, and runs tests, typecheck, lint, and a production build. The action versions were checked against the official [actions/checkout releases](https://github.com/actions/checkout/releases) and [actions/setup-node releases](https://github.com/actions/setup-node/releases) on 2026-10-17. The normal CI and repo hygiene configuration exist in the source bundle; the temporary importer workflow has been staged in the remote bootstrap tree, but there is no verified Actions run yet.

**Verification boundary:** `node --test 'scripts/**/*.test.mjs'` passed all tests in the revised workspace after the configuration additions (224/224). `npm test` as a whole is not green when dependencies are absent: the script-test phase passed, while the TypeScript-import test phase could not load `@tanstack/react-start`, `jose`, and `date-fns`. A dependency installation attempt did not complete in this environment. TypeScript, ESLint, build, browser QA, live authentication, database integration, and workspace isolation remain unverified.

**Repository status:** GitHub metadata reports `Loofy147/Taskora` is a public repository and the native connection has push permission. The initial direct Git-data tree creation returned HTTP 409 on the empty repository. A temporary bootstrap commit and 61 base64 transport chunks were then staged on `main`, along with an importer workflow. The current remote is therefore not empty, but it still does not contain the extracted application source. The workflow has not run, so publication is not complete. The revised local workspace remains the canonical complete source until the remote import and post-import checks succeed.


## Implementation revalidation — workspace recovery

**Date:** 2026-10-17  
**Status:** `EXPERIMENTALLY_SUPPORTED` for the dependency-free validation module; UI/typecheck/browser behavior remains `UNKNOWN` until the complete dependency install and browser QA run.

Implemented in the local source workspace:

- `src/lib/workspace-backup.ts` defines `taskora.workspace-backup` version 1, enforces a 10 MiB bound, validates collection shapes and enums, rejects duplicate IDs and invalid calendar/timestamp values, checks task/project/member/comment/notification references, and fails closed on unknown schema versions.
- Settings can export a JSON snapshot and stage a restore. The restore is not applied until the user confirms the replacement. Import does not execute imported code; it parses JSON and validates it before applying state.
- The backup includes tasks, projects, members, notifications, and settings. It includes attachment metadata only—not file bytes—and is not encrypted.
- The state replacement clears transient selection/filter/panel state so it does not point at records from the previous dataset. Backup actions remain disabled until browser persistence hydration finishes, preventing an early export from capturing the unhydrated seed state.
- `formatStamp` now returns `Unknown date` instead of throwing on malformed persisted timestamps.
- `scripts/workspace-backup.test.mjs` covers valid round trips, malformed JSON, foreign format, unknown versions, impossible dates, duplicate IDs, missing relationships, the required local profile, the size limit, and malformed settings.

**Verification run:** `node --experimental-strip-types --test 'scripts/**/*.test.mjs'` — **224 tests passed, 0 failed**. An isolated strict TypeScript check passed for `workspace-backup.ts` and the domain types; this is not the whole-app typecheck. The real seeded dataset was also passed through the backup generator and parser in a smoke test: 15 tasks, 6 projects, 6 members, 4 notifications, 18,902 bytes; validated successfully. The full `npm test` command still fails its TypeScript-import phase because `npm ci` did not complete and required packages (`@tanstack/react-start`, `jose`, and `date-fns`) are missing from `node_modules`. TypeScript, lint, build, and browser QA are therefore not claimed as passing.

This reduces prototype data-loss risk but does **not** change the architecture boundary: the app remains browser-local, unauthenticated by default, and unsuitable for shared sensitive business records until server-side authentication, workspace authorization, and PostgreSQL persistence are implemented and tested.


## Next implementation frontier — 2026-10-17

1. **Finish repository import before changing remote application code.** The current remote main branch is a bootstrap only; the full application tree and CI result must be verified first.
2. **Provision auth + persistent PostgreSQL before exposing the sync UI to customers.** The UI fails safe while auth is disabled; do not change the app environment to enable it without real session configuration.
3. **Add browser and database integration tests:** initial upload is create-once, restore is explicit, concurrent writes return conflict rather than last-write-wins, signed-out access is denied, and user A cannot read/write user B's snapshot.
4. **Replace whole-state sync with domain CRUD in phases:** `workspaces/memberships` first, then tasks/projects, then comments/subtasks/attachments metadata and audit/activity events. Keep existing Zustand UI behind a repository/service interface to lower migration risk.
5. **Team workspaces and invitations:** use pending, expiring, single-use invitation tokens stored as hashes; enforce role capability checks server-side on every mutation. Do not claim current sample team members are actual accounts.
6. **File storage and notifications:** use private object storage with short-lived signed upload/download URLs and membership checks; implement actual notification records and a queued email provider before exposing upload/digest controls.
7. **Production readiness:** add event retention/partitioning strategy, DB backup + point-in-time recovery, audit log retention, rate limits and payload-size limits; test migrations from a fresh DB and an existing DB; add browser QA after dependency install.
