# Import the complete Taskora workspace

This guide is for importing this ZIP through a repository editor or another code-hosting service. The archive root is the Taskora project root: upload its contents, not an extra wrapper directory.

## 1. Import the source tree

1. Download and extract the handoff ZIP locally.
2. Open the extracted directory and confirm it contains `package.json`, `package-lock.json`, `src/`, `server/`, `migrations/`, `scripts/`, `public/`, and `.github/`.
3. In the destination repository, upload/replace the project files **at the repository root**. Preserve directory structure and dotfiles, especially `.github/`, `.gitignore`, and `.grok/`.
4. Remove the old temporary bootstrap transport if it exists in the destination: `.taskora-import/` and `.github/workflows/import-taskora-source.yml`. Those files are not part of the application and should not remain in the final source tree.
5. Commit the complete tree as one coherent source change. Do not commit only documentation or a selection of files.

Target repository: <https://github.com/Loofy147/Taskora>

## 2. Verify the source before publishing

Use Node.js 22 or newer, then run from the project root:

```sh
npm ci
node --experimental-strip-types --test 'scripts/**/*.test.mjs'
npm test
npm run typecheck
npm run lint
npm run build
```

The focused dependency-free tests are useful when registry access is unavailable, but are not a substitute for the full test suite. The last recorded local run passed 224 dependency-free checks. Full `npm test` did not complete because dependency installation was incomplete; TypeScript-dependent tests, project-wide typecheck, lint, build, and browser QA remain unverified.

The production build invokes the existing migration wrapper. Without `DATABASE_URL`, the wrapper may skip database changes; do not add production credentials merely to run CI.

## 3. Verify the repository after import

- Confirm `src/`, `server/`, `migrations/`, `scripts/`, `docs/`, `package.json`, and `package-lock.json` are visible at the repository root.
- Confirm `.taskora-import/` and the temporary importer workflow have been removed.
- Confirm CI is running the intended workflow, `.github/workflows/ci.yml`, against the new source commit.
- Review test, typecheck, lint, build, and migration outcomes against the same commit SHA.
- Never force-push if the remote contains unexpected history; inspect the existing tree and reconcile deliberately.

## 4. Important implementation boundaries

- The default bundled environment keeps authentication and database provisioning disabled. Do not treat the local demo identity as a real user session.
- The workspace snapshot bridge is an intermediate persistence layer, not normalized per-task CRUD or a collaboration system.
- Backup export/import is user-managed and unencrypted. It may contain business details and email addresses.
- Attachment entries are file references; the project does not yet implement private object storage and authorized file downloads.
- Workspace memberships/invitations, email delivery, durable notification workers, server-side audit/retention policy, backups/PITR, browser QA, and two-account isolation still require implementation and verification.

See `PRODUCT_AUDIT.md`, `IMPLEMENTATION_ROADMAP.md`, and `WORKSPACE_BACKUP_FORMAT.md` for evidence, limits, and exit criteria.
