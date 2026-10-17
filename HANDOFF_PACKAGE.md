# Taskora — source handoff and verification record

The complete project source is published at the root of [`Loofy147/Taskora`](https://github.com/Loofy147/Taskora). This document retains the handoff archive's purpose for portability and mirrors; it is no longer an instruction to perform the original repository import.

## Published source baseline

On 2026-10-17, commit [`cf60790`](https://github.com/Loofy147/Taskora/commit/cf60790b9dd6340a2c699336f9233c1ee715121d) populated the source tree on `main`, and removed the temporary `.taskora-import/` transport and importer workflow.

The [CI run for that exact commit](https://github.com/Loofy147/Taskora/actions/runs/39053827997) passed the configured test suite, TypeScript check, ESLint, and production build. That baseline run reported six lint warnings and a 701.08 kB client JavaScript chunk (190.83 kB gzip); those measurements are historical baseline data, not a claim about later commits. Check each subsequent commit's own workflow before relying on it.

## Package contents

- Complete Taskora source and lockfile.
- Repository hygiene and automation: GitHub Actions CI, Dependabot, issue templates, security guidance, and regression checks.
- Versioned browser-local workspace backup/restore and its format documentation.
- Initial PostgreSQL workspace-snapshot bridge, migration, server-boundary checks, revision/conflict handling, and targeted tests.
- Product audit, implementation roadmap, import guide, screenshots, and bundled engineering/reference assets.

The project root is the archive root. When importing into a mirror, upload all files—including dotfiles—to the repository root; do not create an extra nested `Taskora/` directory.

## Verification boundaries

- CI passing proves the configured automated tests, typecheck, lint command exit status, and build for the exact tested commit. It does not verify browser interactions or live deployment services.
- The build's migration wrapper skips live migration when `DATABASE_URL` is absent. The baseline CI run did not apply a live PostgreSQL migration.
- The shipped `.grok/app-env.json` leaves `VITE_AUTH_ENABLED=false` and database provisioning disabled. Do not treat the demo identity as a real authenticated user.
- The personal snapshot bridge is not normalized per-task CRUD or team collaboration. Cross-account isolation, concurrent database updates, restore against a live backend, and browser end-to-end behavior require explicit integration evidence.
- Attachment entries are references, not uploaded files; notifications are seeded UI data, not a delivery service.
- Backups are user-managed and unencrypted. Handle exported data as potentially sensitive business data.

`HANDOFF_MANIFEST.json` and `SHA256SUMS.txt` record the original archive snapshot. Their hashes should not be interpreted as checksums of later repository revisions.

## Mirror/import procedure

1. Extract the handoff archive including dotfiles.
2. Inspect its root and confirm it includes `package.json`, `package-lock.json`, `src/`, `server/`, `migrations/`, `scripts/`, `public/`, and `.github/`.
3. Upload to a separate target repository, preserving paths.
4. Confirm temporary transport-only files are absent.
5. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` on the exact resulting commit.
6. Configure real authentication/database only through deployment secret management and complete the integration gates before enabling cloud sync.

See `docs/PRODUCT_AUDIT.md` and `docs/IMPLEMENTATION_ROADMAP.md` for remaining engineering and verification gates.
