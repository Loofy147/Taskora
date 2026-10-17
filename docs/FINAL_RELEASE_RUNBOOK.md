# Taskora final release runbook

**Purpose:** finish implementation, documentation and verification before using a limited AppDeploy deployment allowance.  
**Policy:** a deployment is a release-stage operation, not a development save. Do not deploy after every code edit.

## 1. Source-of-truth selection

Before each task, record which implementation is being changed:

- **GitHub source:** `Loofy147/Taskora`, branch/ref/commit, React/TanStack Start, Better Auth and PostgreSQL/PGlite.
- **AppDeploy staging port:** app ID `taskora-ube0f6`, current deployed source revision `1792264284898`, AppDeploy auth and managed key-value database.

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

## 4. Required final browser run

Use a disposable account and unique test records. Run desktop and mobile checks:

1. App loads, API health visible, sign-in and sign-out.
2. Task migration preflight, explicit confirmation, successful initial import, idempotent retry.
3. Create → edit → change status → comment → refresh/reload → verify server state.
4. Concurrent stale update → explicit conflict → refresh and recover without lost update.
5. Delete a test task → refresh/reload → confirm absence and safe tombstone behavior.
6. Account A/B isolation in the same browser and independent sessions.
7. Backup export, validated restore, invalid/oversized backup rejection.
8. Auth expiry/network/database errors and recovery prompts.
9. Mobile/desktop navigation, forms, keyboard access and empty/error/loading states.
10. Inspect the E2E test result, logs, network errors and exact deployed source revision.

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
