# Taskora

Taskora is a business task-management interface for organizing shared work across tasks, projects, and a sample team.

> **Current state: prototype with an opt-in personal snapshot backend; not production-ready.** The app stores task, project, team, comment, notification, and settings state in the current browser's `localStorage` by default. A versioned PostgreSQL JSONB snapshot path and an opt-in Settings flow are now implemented, but the shipped `.grok/app-env.json` explicitly disables authentication and database provisioning, so cloud persistence is unavailable until deployment authentication and a durable database are configured. This is a personal snapshot sync bridge, not relational per-task CRUD, team sharing, real-time collaboration, invitations, or file uploads.

## Current interface

- Kanban board with To Do, In Progress, and Done columns.
- Task creation, editing, status changes, priorities, assignees, subtasks, comments, and sample file references.
- Project overview, team workload, calendar, file-reference list, reports, preferences, and local JSON backup/restore.
- Responsive desktop/mobile navigation and keyboard shortcuts (`N` for new task, `/` for search, `Esc` to close the active panel).
- Versioned JSON backup/restore and an opt-in personal workspace snapshot bridge with strict validation, explicit upload/restore confirmation, revision-based write conflict detection, and fail-closed behavior when the shared demo identity mode is enabled.

## Run locally

Requires Node.js 22 or compatible current LTS and npm.

```bash
npm ci
npm run dev
```

Other checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The workspace package includes App Builder helper scripts and a Vite/TanStack Start setup. `npm test` includes embedded PGlite integration tests for personal-snapshot persistence, revision conflicts, event consistency and storage-level isolation; the integration suite refuses to run when `DATABASE_URL` is set. Deploy-time database migrations run only when `DATABASE_URL` is provided. The application remains configured with auth and database provisioning disabled in `.grok/app-env.json`.

## Important limitations before real business use

1. **The snapshot bridge is a migration step, not a full shared backend.** `src/lib/store.ts` still owns operational task state in Zustand/localStorage. `src/lib/workspace-data.ts` exposes authenticated endpoints that upload, load, and compare-and-swap the entire validated workspace snapshot, but task edits are not yet modeled as individual server CRUD operations.
2. **Authentication and durable PostgreSQL are disabled in the shipped environment.** `migrations/0001_workspace_storage.sql` defines personal workspaces, owner membership, versioned snapshot state, and a minimal write-event ledger. Storage-level integration tests pass against embedded PGlite, but deployed auth sessions and live PostgreSQL remain unverified. The endpoints refuse the shared `dev-user` identity when `VITE_AUTH_ENABLED=false`. When auth is enabled, the command wrapper prepares `migrations/0001_auth.sql` from the canonical `migrations/auth/0001_auth.sql`; a missing or drifted schema fails closed. Configure the platform's real auth settings and `DATABASE_URL` before expecting durable cloud storage. The embedded PGlite preview can reset on process restart.
3. **No team-sharing or invitation workflow.** `ME` is still a prototype identity in `src/lib/types.ts`; team members are sample workspace records. The snapshot bridge is private to one verified account and does not yet allow one account to share a workspace with another.
4. **No actual file storage.** Adding a file saves its name, size, and inferred type only. File bytes are not uploaded, shared, previewed, or downloadable.
5. **Notifications and digest are not operational.** The notification list is seeded sample data; the daily-digest setting does not send email.
6. **Backups are not encrypted.** Settings supports versioned export and validated restore; imported data replaces browser state only after explicit confirmation. When cloud sync is active, a restored/reset workspace is also synced to the server. Backup files may contain task text, comments, and team contact details; store them securely.

See [`docs/PRODUCT_AUDIT.md`](docs/PRODUCT_AUDIT.md) for evidence-led findings, [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) for the staged architecture and test gates, and [`docs/WORKSPACE_BACKUP_FORMAT.md`](docs/WORKSPACE_BACKUP_FORMAT.md) for the backup schema and validation contract.
