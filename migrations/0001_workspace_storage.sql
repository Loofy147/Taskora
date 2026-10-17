-- Taskora workspace persistence. Identity and authorization come from the
-- server-verified auth middleware; client-supplied user IDs are never trusted.
-- Snapshot writes use optimistic revision checks so stale tabs cannot silently
-- overwrite newer state. Normalized task tables can replace JSONB incrementally.

CREATE TABLE IF NOT EXISTS taskora_workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My workspace',
  kind TEXT NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'team')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS taskora_one_personal_workspace_per_owner
  ON taskora_workspaces (owner_user_id)
  WHERE kind = 'personal';

CREATE TABLE IF NOT EXISTS taskora_workspace_memberships (
  workspace_id TEXT NOT NULL REFERENCES taskora_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS taskora_workspace_memberships_user_idx
  ON taskora_workspace_memberships (user_id, workspace_id);

CREATE TABLE IF NOT EXISTS taskora_workspace_state (
  workspace_id TEXT PRIMARY KEY REFERENCES taskora_workspaces(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL CHECK (revision >= 1),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS taskora_workspace_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES taskora_workspaces(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL CHECK (revision >= 1),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('initialized', 'snapshot_saved')),
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, revision)
);

CREATE INDEX IF NOT EXISTS taskora_workspace_events_recent_idx
  ON taskora_workspace_events (workspace_id, created_at DESC);
