# Taskora workspace backup format

**Format identifier:** `taskora.workspace-backup`  
**Current schema version:** `1`  
**Maximum input/output size:** 10 MiB

## Purpose and boundary

This JSON format is a recovery mechanism for the current browser-local prototype. It is not a synchronization format, a database snapshot, or an encrypted export. Import replaces the current local data after explicit confirmation; invalid or unknown-version backups are rejected before state changes.

## Top-level shape

```json
{
  "format": "taskora.workspace-backup",
  "version": 1,
  "exportedAt": "2026-10-17T12:00:00.000Z",
  "data": {
    "tasks": [],
    "projects": [],
    "members": [],
    "notifications": [],
    "settings": {
      "weekStart": "mon",
      "density": "comfortable",
      "digest": true
    }
  }
}
```

The collections use the same domain record structures as `src/lib/types.ts`. Attachments are references containing metadata only; file contents are never included.

## Validation invariants

The parser rejects inputs that exceed the size limit, are not JSON, have a different format identifier, use an unsupported version, or contain malformed collections. It also rejects duplicate IDs, invalid enum values, impossible calendar dates, malformed ISO timestamps, repeated assignees, and dangling references from tasks/comments/notifications to projects, members, or tasks. The current prototype requires the local profile ID `hichem`; that constraint must be removed when the app replaces its hard-coded identity with authenticated sessions.

Schema versions are not guessed or silently coerced. A future incompatible version requires an explicit migration and tests before this parser accepts it.

## Handling and privacy

A backup can contain task titles, descriptions, summaries, comments, team names, and email addresses. The file is unencrypted. Users should store it in a private location and share it only with people authorized to read the contents. Import parses JSON as data; it does not execute script content. This local backup feature is not a substitute for server-side authorization, database backups, or audit history.
