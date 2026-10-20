# Canonical portfolio data and migration

## Purpose

Replace the prototype catalog with the real, source-linked work portfolio. The baseline is assembled from existing Taskora/Notion objectives, repository links and user-reported project context; it is not a claim that every project has been independently re-audited today.

## Canonical source

- Dataset: src/lib/portfolio-seed.ts.
- The local personal board and authenticated /workspace initializer read the same project/task catalog.
- Every project/task has a stable ID and stable request key. Cloud create calls are scoped by actor/workspace and safe to retry.
- Task descriptions carry acceptance criteria or the next evidence needed and a source/reference when one is known.
- Task states are conservative. Only the exact PR #20 CI verification milestone is marked done based on CI run 39478105565 for SHA 96b8a7f9bc1e3ad38971e62217d3f4283a1a819f. Previously reported metrics/builds stay pending reproduction until the current run is attached.
- Unknown deadlines stay empty; no fake teammates, example emails, comments, attachments, notifications or fabricated file contents are seeded.

## Existing local-storage migration

The Zustand storage key remains taskflow-pro-v1 to avoid abandoning existing browser data. Persisted schema version 2 runs an additive migration:

1. Replace the original known fixture task IDs with the canonical portfolio task baseline.
2. Preserve custom tasks/projects. If a retained custom task points at a sample project, keep that project as a clearly labelled recovered project for review.
3. Remove original sample notifications and any notification whose task reference no longer exists.
4. Remove unused sample collaborators. If retained records refer to one, replace its name/email with an unverified-identity marker rather than inventing a person.
5. Preserve user settings and a customized owner profile. Clear only known @example.com placeholder addresses.

The migration runs once when persisted schema version changes; it does not reset or rewrite records on every launch. Export a backup before manual reset/restore. User-created records are not intentionally replaced by seed defaults.

## Cloud population

In authenticated /workspace, the Populate real portfolio action adds canonical projects and tasks through server domain calls using stable request keys. Re-running is additive/idempotent; existing task status, dates and edits are not overwritten by seed refresh. Newly created cloud tasks are assigned to the verified current user only. No deadlines or schedules are fabricated.

Cloud population cannot currently be confirmed live because the checked Vercel project has no visible environment configuration or attached PostgreSQL database. Configure a dedicated preview database and Better Auth first, then run live sign-in, save/reload, conflict/retry and backup/restore acceptance. Green CI or a READY preview is not proof of live persistence.

## Deployment boundary

The Vercel server-backed workspace and AppDeploy/browser-local board are separate deployments/stores. Shared seed source in Git makes their initial content consistent, but does not synchronize records created or edited in either deployment. Import/export between stores must remain explicit and include validation, conflict preview, destination backup and rollback.


## Additive import and private source data

- The backup schema permits an empty task due date and an empty profile email: unknown values remain explicitly unknown and are not fabricated for export/import.
- Settings provides two validated import actions: **Merge missing records** (stable-ID idempotent; preserves current task fields, project names, settings and existing members while adding source context) or **Replace current data** (destructive replacement, with an export-before-replace warning).
- Real registered Notion projects/work items are private portfolio data. Do not embed their titles/details, trading plans, equipment budgets, credentials or other private information in this public repository. Import the user's exported/approved private snapshot instead; source record URLs remain the canonical detail/provenance.
- An import remains a manual snapshot, not live Notion synchronization. The Vercel cloud workspace and AppDeploy/local board still remain separate stores.
