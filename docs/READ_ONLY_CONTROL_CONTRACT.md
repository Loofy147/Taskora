# Taskora read-only control-plane contract

**Status:** Contract and pure policy helpers implemented on `feat/taskora-server-backed-workspace`; no HTTP endpoint, provider adapter, operator console or production control authority is enabled.

**Parent decision:** [Two-plane architecture and control boundary](TWO_PLANE_CONTROL_ARCHITECTURE.md).

## Purpose

Establish a stable boundary for future personal-plane visibility into the Vercel scale plane. The initial scope is read-only deployment evidence: target identity, deployment state, source revision, summarized required checks, runtime-error observation window and freshness. The contract does not call Vercel/GitHub, authenticate sessions, provision credentials or mutate provider state.

## Code and tests

- `src/lib/control-plane/read-only-contract.ts` contains the versioned response type, client-safe observation normalizer, freshness classification and fail-closed action policy.
- `scripts/control-plane-contract.test.mjs` verifies allow-list enforcement, authorization denial cases, URL safety, secret-field stripping, unknown states and stale/future/invalid timestamps.
- The existing `npm test` script discovers this test under `scripts/**/*.test.mjs`; TypeScript and lint checks also cover the module.
- The authenticated endpoint and provider adapter remain unimplemented until the server hosting, verified operator identity, server-only secret storage and narrow provider scopes have been validated.

## Response schema v1

A response is a normalized snapshot, not a live promise that every provider query succeeded.

| Field | Meaning |
|---|---|
| `schemaVersion` | Integer schema contract version; initially `1`. |
| `observedAt` | ISO-8601 timestamp for the provider observation, or `null` if not valid. |
| `freshness` | `fresh`, `stale`, `future`, or `unknown`; default freshness window is five minutes with a 30-second future skew allowance. |
| `target` | Fixed provider name, project ID, deployment ID, environment (`production` or `preview`), HTTPS URL, branch and validated 40-character commit SHA. |
| `deployment.state` | Normalized provider state; unfamiliar values become `unknown`, never `ready`. |
| `checks` | Allow-listed status, valid observation time and HTTPS evidence URL. Missing or unfamiliar state becomes `unknown`. The adapter must aggregate all required checks before it reports `success`. |
| `runtimeErrors` | Count plus query window and query time, or `null` if the source data is missing or inconsistent. An empty error window is not an E2E pass. |

The normalizer copies only known fields. Unrecognized provider fields—including tokens, secret values, headers or raw payloads—are intentionally discarded. The caller must supply an exact server-configured project ID and an explicit list of permitted deployment hostnames; missing target policy fails closed. The observed project ID must match exactly and the deployment URL hostname must match one exact hostname (wildcards, arbitrary HTTPS domains, credentials in URLs and non-HTTPS URLs are rejected). These configuration values must be fixed server-side, not derived from request parameters. Unknown provider states become `unknown` rather than `ready`.

## Read-only action policy

The only v1 actions are:

- `status.read`
- `deployment.read`
- `checks.read`
- `runtime-errors.read`

The policy denies access when the feature is disabled, the verified server session is absent, the identity is not on the server-side operator allow-list, or the requested action is not in the fixed allow-list. A session/role/operator decision passed to this helper must come from trusted server middleware; it must never be copied from request JSON or browser state.

The policy helper is not a substitute for authentication middleware, a network route, a database audit log or provider authorization. There are deliberately **no** v1 actions for deployment promotion, rollback, environment writes, arbitrary provider URLs, shell commands or SQL.

## Eventual endpoint (not implemented)

The candidate interface is `GET /api/control/v1/status`, protected by verified operator authentication and served by a server-only adapter. Before that route can be enabled:

1. Confirm the host supports outbound calls, server-only secret storage, request limits and safe log redaction.
2. Verify a dedicated operator identity/allow-list independent of customer workspace membership.
3. Verify a provider credential's actual project/action scope. Do not put a broad token in browser code, Vite variables exposed to the client, localStorage or exported backups.
4. Fix the Vercel project and environment IDs server-side; do not accept arbitrary project IDs or provider URLs from the request.
5. Query only allow-listed Vercel deployment/alias/runtime-error endpoints and GitHub check summaries. Never request decrypted environment-variable values.
6. Return the normalized schema with a query timestamp and explicit provider error/staleness state.
7. Test anonymous/expired sessions, forged target IDs, secret redaction, rate limits, timeout handling and absence of mutation endpoints.

If these conditions cannot be proven in AppDeploy, host the adapter in a dedicated server-side failure domain or keep visibility in the provider consoles. Track A must continue operating if the personal plane or controller is unavailable.

## Acceptance gates

- [x] Contract type is versioned and explicitly read-only.
- [x] Authorization helper fails closed and restricts actions to the static allow-list.
- [x] Freshness distinguishes current, stale, future and invalid observations.
- [x] Normalization excludes unknown fields, requires a server-configured project ID and exact hostname allow-list, and rejects target mismatch, wildcard hosts and arbitrary HTTPS domains.
- [x] Automated tests cover policy, timestamps, URL checks, unknown states and redaction.
- [ ] Add the authenticated HTTP handler and verified provider adapter.
- [ ] Capture live, timestamped provider observations without exposing credentials.
- [ ] Prove operator access denial, logging/redaction, timeout behavior and that no mutation route/action is reachable.
- [ ] Verify the personal console remains usable when Taskora's customer task APIs are unavailable.

A green test run for these pure helpers does not certify the live controller, Vercel environment, PostgreSQL persistence or Taskora end-to-end behavior.
