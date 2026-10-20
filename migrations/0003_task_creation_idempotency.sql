CREATE TABLE IF NOT EXISTS taskora_idempotency_records (
  workspace_id TEXT NOT NULL REFERENCES taskora_workspaces(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('project.create', 'task.create')),
  request_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, actor_user_id, operation, request_id)
);

CREATE INDEX IF NOT EXISTS taskora_idempotency_created_at_idx
  ON taskora_idempotency_records (created_at);
