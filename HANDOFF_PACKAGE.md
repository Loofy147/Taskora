# Taskora — complete source handoff

This directory is the full Taskora project tree, prepared for manual import through another repository service.

## Package contents

- The latest complete Taskora source baseline, taking precedence where it differed from earlier workspace snapshots.
- Repository hygiene and automation: GitHub Actions CI, Dependabot, issue templates, security guidance, and dependency-free regression checks.
- Versioned browser-local workspace backup/restore and its format documentation.
- The initial PostgreSQL workspace-snapshot bridge, migration, server-boundary checks, revision/conflict handling, and targeted tests.
- Product audit, implementation roadmap, import guide, screenshots, and bundled engineering/reference assets that appeared in earlier workspace packages.

The actual project files are at the archive root. Do not place them inside a second nested `Taskora/` folder when uploading to the target repository.

## Verification boundary

- ZIP and SHA-256 integrity are verified separately by the accompanying checksum file.
- The latest recorded dependency-free regression run passed 224/224 checks.
- Full dependency installation did not complete in the prior run. The full test suite, project-wide TypeScript check, lint, production build, browser QA, deployed database integration, authenticated two-user access isolation, and team collaboration are **not verified**.
- This package contains no `.git/` directory and no intentionally included `.env` file. Review `.grok/app-env.json` before deploying: it explicitly leaves `VITE_AUTH_ENABLED=false` and database provisioning disabled.

## Recommended manual import

1. Extract all files including dotfiles.
2. Upload the contents to the root of the intended Taskora repository while preserving paths.
3. Delete stale transport-only paths from the remote if they remain: `.taskora-import/` and `.github/workflows/import-taskora-source.yml`.
4. Commit the complete tree, then run CI and inspect the exact commit's test/typecheck/lint/build results.
5. Do not enable cloud sync in production until real session authentication, database provisioning, workspace authorization, two-account isolation tests, and restore procedures are verified.

See `docs/REPOSITORY_IMPORT.md` and `docs/IMPLEMENTATION_ROADMAP.md` for the operational checklist.
