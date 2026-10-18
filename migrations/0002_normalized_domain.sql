-- Normalized Taskora domain tables.
-- Additive migration: the existing whole-workspace snapshot bridge remains
-- available during rollout; new service-backed operations use these tables.
-- All multi-row mutations go through a transaction with actor membership checks.

ALTER TABLE taskora_workspace_memberships
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE taskora_workspace_memberships
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taskora_membership_status_check'
      AND conrelid = 'taskora_workspace_memberships'::regclass
  ) THEN
    ALTER TABLE taskora_workspace_memberships
      ADD CONSTRAINT taskora_membership_status_check
      CHECK (status IN ('active', 'revoked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taskora_membership_revocation_check'
      AND conrelid = 'taskora_workspace_memberships'::regclass
  ) THEN
    ALTER TABLE taskora_workspace_memberships
      ADD CONSTRAINT taskora_membership_revocation_check
      CHECK (
        (status = 'active' AND revoked_at IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS taskora_one_active_owner_per_workspace
  ON taskora_workspace_memberships (workspace_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS taskora_active_membership_lookup_idx
  ON taskora_workspace_memberships (workspace_id, user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS taskora_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES taskora_workspaces(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 500),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'done')),
  created_by_user_id TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMPTZ,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES taskora_workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE IF NOT EXISTS taskora_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES taskora_workspaces(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('todo', 'progress', 'done')),
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  due_date DATE,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  scheduled_timezone TEXT,
  created_by_user_id TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMPTZ,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES taskora_projects (workspace_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES taskora_workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (scheduled_start_at IS NULL AND scheduled_end_at IS NULL AND scheduled_timezone IS NULL)
    OR
    (scheduled_start_at IS NOT NULL AND scheduled_end_at IS NOT NULL
      AND scheduled_timezone IS NOT NULL AND length(trim(scheduled_timezone)) > 0
      AND scheduled_end_at > scheduled_start_at)
  ),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE INDEX IF NOT EXISTS taskora_tasks_workspace_created_idx
  ON taskora_tasks (workspace_id, created_at DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS taskora_tasks_workspace_status_due_idx
  ON taskora_tasks (workspace_id, status, due_date)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS taskora_tasks_workspace_project_idx
  ON taskora_tasks (workspace_id, project_id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS taskora_task_assignees (
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, task_id, user_id),
  FOREIGN KEY (workspace_id, task_id)
    REFERENCES taskora_tasks (workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES taskora_workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS taskora_task_assignees_user_idx
  ON taskora_task_assignees (workspace_id, user_id, task_id);

CREATE TABLE IF NOT EXISTS taskora_subtasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  rank BIGINT NOT NULL DEFAULT 0 CHECK (rank >= 0),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, task_id)
    REFERENCES taskora_tasks (workspace_id, id)
    ON DELETE CASCADE,
  CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS taskora_subtasks_task_rank_idx
  ON taskora_subtasks (workspace_id, task_id, rank, id);

CREATE TABLE IF NOT EXISTS taskora_comments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 100000),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, task_id)
    REFERENCES taskora_tasks (workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, author_user_id)
    REFERENCES taskora_workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS taskora_comments_task_created_idx
  ON taskora_comments (workspace_id, task_id, created_at, id);
