# Taskora implementation evidence ledger

**Updated:** 2026-10-18  
**Canonical `main` source:** [`34469fa95bbcf6fb5ec674c4eb93a0e31ca074a0`](https://github.com/Loofy147/Taskora/commit/34469fa95bbcf6fb5ec674c4eb93a0e31ca074a0) — normalized service foundation  
**Post-merge CI:** [run 39154671894](https://github.com/Loofy147/Taskora/actions/runs/39154671894) — tests, typecheck, lint, build, and auth-on PostgreSQL migration verification passed  
**Current repair:** [PR #19](https://github.com/Loofy147/Taskora/pull/19) — auth entry points; open, not merged  
**PR code CI:** [run 39157670515](https://github.com/Loofy147/Taskora/actions/runs/39157670515) — all jobs passed at implementation commit `1a5cd049cbd268918dce0f6bc6433ed25d4b5764`

This ledger distinguishes source-code and CI evidence from live authentication, durable persistence, and release acceptance. A Vercel deployment marked `Ready` is not by itself a production-readiness result.

## Verified observations

| Capability / claim | Status | Evidence boundary |
|---|---|---|
| Canonical source deployed | ESTABLISHED | Vercel deployment metadata reports production target, framework `tanstack-start`, repository `Loofy147/Taskora`, branch `main`, and commit `34469fa95bbcf6fb5ec674c4eb93a0e31ca074a0`. Production alias: [taskora-omega-seven.vercel.app](https://taskora-omega-seven.vercel.app/). |
| Production page renders | EXPERIMENTALLY_SUPPORTED | Anonymous browser scrape returned HTTP 200 and the Taskora shell rendered. The dashboard screenshot reported 43 CDN requests, 12 function invocations, and 0% error rate at capture time; these counters do not prove functional correctness. |
| UI persistence mode | EXPERIMENTALLY_SUPPORTED | Live Settings explicitly states the workspace is stored locally by default, shows cloud status `Unauthorized`, and says cloud persistence requires authenticated sign-in and a working server database. The page also labels itself as local prototype data. |
| Local task CRUD | EXPERIMENTALLY_SUPPORTED | In an isolated test-browser session, one uniquely named disposable task was created, edited, moved to `In Progress`, retained after a page reload, then deleted. The visible task count returned to 15. This demonstrates browser-local state only, not server persistence; no user data was changed. |
| Baseline auth routes | CONTRADICTED | Before PR #19, live `/login` and `/api/auth/get-session` probes both returned HTTP 404. The checked-in generated route tree at the production source registered only `/`. |
| Auth entrypoint repair source | CI PASS | PR #19 adds `src/routes/api/auth/$.ts`, `src/routes/login.tsx`, session-aware sign-in controls, the generated route registration, and static regression tests. The implementation CI run passed. |
| PR preview deployment | READY; browser verification BLOCKED | Vercel's GitHub bot reports the preview as Ready: [PR preview](https://taskora-git-fix-taskora-auth-e-66aeb5-djangos-projects-996fd933.vercel.app/). Anonymous checks redirect to Vercel's deployment-protection login, so the preview route results were not observed. Do not infer they passed from the Ready badge. |
| Vercel runtime/config diagnostics | NOT VERIFIED | The connected Vercel API returned access-denied/not-found responses for runtime diagnostics and environment metadata. No environment values were read or changed. |
| Normalized task/project schema and service | CI PASS | `migrations/0002_normalized_domain.sql`, `src/lib/taskora-domain.server.ts`, and `src/lib/taskora-domain.server.integration.test.ts` verify normalized entities, transactional operations, workspace authorization, keyset pagination, optimistic-version conflicts, archiving, and PGlite/PostgreSQL behavior. |
| Existing task UI wired to normalized CRUD | NOT IMPLEMENTED | The normal task board still uses the local Zustand store. The normalized server functions are additive and are not yet the backing store for task edits. |
| Real sign-in/sign-out lifecycle | NOT RUN | No real provider flow was completed. Session cookies, callback routing, expiry/refresh, and reauthentication still require browser verification. |
| Cloud persistence and two-account isolation | NOT VERIFIED | No authenticated cloud read/write was proven through the live browser. PGlite service tests are not a substitute for two-account deployed E2E. |
| Production release acceptance | HOLD | Deployment status is `Ready`, but authentication, server persistence, account isolation, and recovery gates remain unverified. No production deploy was manually triggered for PR #19. |

## Next gated work

1. Obtain authorized access to the Vercel `Django's projects` team and `taskora` project so protected-preview behavior, environment-variable presence (names only), and runtime diagnostics can be checked without exposing secret values.
2. On the preview, verify `/login`, `/api/auth/get-session`, provider sign-in/callback, and sign-out. Confirm that required production environment settings and a durable database are configured before enabling cloud persistence.
3. With disposable accounts, verify snapshot initialize/load/save, reload persistence, two-account isolation, stale-write conflict behavior, backup/restore, and failure recovery.
4. Integrate task/project UI reads and writes with the normalized service only behind tested migration and recovery paths. Preserve the local prototype until the complete candidate is verified.
5. Keep production release on HOLD until authenticated browser evidence is recorded. Batch the complete candidate and reserve production deployment for that release gate.
