# Runtime health endpoint

**Source:** GitHub Taskora, TanStack Start / Better Auth / PostgreSQL track. This does not describe the separate AppDeploy staging port.

## Contract

GET /api/health

The route is a read-only operational probe. It returns HTTP 200 when the application handler responds, and its JSON distinguishes process liveness from application readiness:

- status = "ok" means the handler completed.
- readiness = "ready" requires both a reachable configured PostgreSQL database and configured authentication.
- readiness = "blocked" means at least one readiness check has not passed.
- checks.database is one of: ready, development_only, not_configured, unavailable.
- checks.authentication is configured or not_configured.
- checkedAt is the UTC timestamp of the probe.

The database check sends only SELECT 1. It does not read task/customer data or mutate application records. PGlite is reported as development_only, never as durable deployment storage. Provider errors are suppressed from the public response; connection strings and secret values are not returned.

## Verification boundary

This endpoint is not proof that OAuth callbacks work, migrations are current, CRUD persists after reload, concurrent writes recover correctly, or two accounts are isolated. A ready response clears only the basic configuration/connectivity gate. Run the authenticated end-to-end acceptance suite before production promotion.

## HOS Change Signature v1

- **Classification:** Observable-readiness capability addition.
- **Source baseline:** Taskora PR #20 head e9930d792615a079fbfdb3e1d90b24335b6e87d4.
- **Scope:** GitHub/Vercel source only; no AppDeploy source, production settings, credentials, or deployment changed.
- **Evidence basis:** Existing dbSource, getPostgresPool, and authConfigured contracts; regression cases added for readiness-state derivation and non-disclosure.
- **Verification state at commit:** Contract tests committed; GitHub CI and live endpoint test pending.
- **Residual uncertainty:** Passing connectivity/configuration does not verify migrations, OAuth callback behavior, task persistence, conflict recovery, or account isolation.
