# Import and verify the Taskora workspace

This guide covers importing the handoff archive into a separate repository or rebuilding a mirror. The original import into [`Loofy147/Taskora`](https://github.com/Loofy147/Taskora) is complete at baseline commit [`cf60790`](https://github.com/Loofy147/Taskora/commit/cf60790b9dd6340a2c699336f9233c1ee715121d).

## 1. Import the source tree into a mirror

1. Download and extract the handoff ZIP locally.
2. Confirm the archive root contains `package.json`, `package-lock.json`, `src/`, `server/`, `migrations/`, `scripts/`, `public/`, and `.github/`.
3. Upload the contents to the destination repository's root. Preserve directory structure and dotfiles, especially `.github/`, `.gitignore`, and `.grok/`.
4. Do not include the temporary transport-only paths `.taskora-import/` or `.github/workflows/import-taskora-source.yml`; they were used only during the original remote import.
5. Commit the complete source tree coherently. Do not commit only a subset of source files.

## 2. Verify the exact commit before publishing

Use Node.js 22 or newer and run from the project root:

```sh
npm ci
node --experimental-strip-types --test 'scripts/**/*.test.mjs'
npm test
npm run typecheck
npm run lint
npm run build
```

The historical local workspace-recovery attempt passed 224 dependency-free regression checks but could not complete dependency installation in that environment. Later, remote CI run [39053827997](https://github.com/Loofy147/Taskora/actions/runs/39053827997) passed the full configured test, typecheck, lint, and production build stages on commit `cf60790`. For later commits, verify the workflow run associated with the exact SHA instead of reusing this earlier result.

The production build invokes the migration wrapper. If `DATABASE_URL` is absent, migration is skipped; CI must not be given production credentials merely to make a build green.

## 3. Repository verification checklist

- Confirm `src/`, `server/`, `migrations/`, `scripts/`, `docs/`, `package.json`, and `package-lock.json` exist at the root.
- Confirm temporary transport files are absent.
- Confirm `.github/workflows/ci.yml` is the intended workflow.
- Review the tests, typecheck, lint, build, and migration outcomes against the same commit SHA.
- Never force-push to resolve unexpected history; inspect the existing tree and reconcile it deliberately.

## 4. Important implementation boundaries

- The default shipped environment keeps authentication and database provisioning disabled. Do not treat the local demo identity as a real session.
- The workspace snapshot bridge is an intermediate persistence layer, not normalized per-task CRUD or a collaboration system.
- Backup export/import is user-managed and unencrypted. It may contain business details and email addresses.
- Attachment entries are file references; private object storage and authorized downloads are not implemented.
- Workspace memberships/invitations, email delivery, durable notification workers, server-side audit/retention, backups/PITR, browser QA, and two-account isolation still need implementation and verification.

See `PRODUCT_AUDIT.md`, `IMPLEMENTATION_ROADMAP.md`, and `WORKSPACE_BACKUP_FORMAT.md` for evidence, limits, and exit criteria.
