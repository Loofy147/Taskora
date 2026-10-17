import { randomUUID } from "node:crypto";
import { dbSource, getSql } from "./db.ts";
import { parseWorkspaceBackup } from "./workspace-backup.ts";
import {
  derivePersonalWorkspaceId,
  normalizeWorkspaceRevision,
  storageAuthModeAllowsPersistence,
  validateWorkspaceSnapshot,
  type WorkspaceBackupData,
} from "./workspace-storage-core.ts";

export class WorkspaceStorageUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super("Workspace cloud storage requires authenticated accounts. Enable VITE_AUTH_ENABLED and configure the app's sign-in provider before using server persistence.");
    this.name = "WorkspaceStorageUnavailableError";
  }
}

function assertWorkspaceStorageAvailable(): void {
  // The shipped preview mode resolves every visitor to the same `dev-user`.
  // Never expose persisted workspace endpoints under that shared identity,
  // even if a database URL is accidentally injected into that environment.
  if (!storageAuthModeAllowsPersistence(process.env.VITE_AUTH_ENABLED)) {
    throw new WorkspaceStorageUnavailableError();
  }
}

export class WorkspaceAccessError extends Error {
  readonly status = 403;
  constructor() {
    super("You do not have access to this workspace.");
    this.name = "WorkspaceAccessError";
  }
}

export class WorkspaceSnapshotConflictError extends Error {
  readonly status = 409;
  readonly code = "WORKSPACE_SNAPSHOT_CONFLICT";
  readonly currentRevision: number | null;

  constructor(currentRevision: number | null) {
    super("The workspace changed in another session. Load the latest snapshot before saving again.");
    this.name = "WorkspaceSnapshotConflictError";
    this.currentRevision = currentRevision;
  }
}

export interface WorkspaceStorageStatus {
  workspaceId: string;
  hasSnapshot: boolean;
  revision: number | null;
  updatedAt: string | null;
  database: "postgres" | "preview";
}

export interface WorkspaceSnapshot extends WorkspaceStorageStatus {
  hasSnapshot: true;
  revision: number;
  updatedAt: string;
  data: WorkspaceBackupData;
}

function requireUserId(userId: string): string {
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > 512) {
    throw new WorkspaceAccessError();
  }
  return userId;
}

async function ensurePersonalWorkspace(userIdInput: string): Promise<string> {
  const userId = requireUserId(userIdInput);
  const workspaceId = derivePersonalWorkspaceId(userId);
  const sql = await getSql();

  await sql.query(
    `INSERT INTO taskora_workspaces (id, owner_user_id, name, kind)
     VALUES ($1, $2, 'My workspace', 'personal')
     ON CONFLICT (id) DO NOTHING`,
    [workspaceId, userId],
  );
  await sql.query(
    `INSERT INTO taskora_workspace_memberships (workspace_id, user_id, role)
     SELECT id, owner_user_id, 'owner'
     FROM taskora_workspaces
     WHERE id = $1 AND owner_user_id = $2 AND kind = 'personal'
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId],
  );

  const membership = await sql.query<{ role: string }>(
    `SELECT m.role
       FROM taskora_workspace_memberships m
       JOIN taskora_workspaces w ON w.id = m.workspace_id
      WHERE m.workspace_id = $1 AND m.user_id = $2
        AND w.owner_user_id = $2 AND w.kind = 'personal'
      LIMIT 1`,
    [workspaceId, userId],
  );
  if (!membership.length || membership[0].role !== "owner") throw new WorkspaceAccessError();
  return workspaceId;
}

function parseStoredData(value: unknown): WorkspaceBackupData {
  let serialized: string;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    throw new Error("Stored workspace snapshot is not valid JSON.");
  }
  if (typeof serialized !== "string") throw new Error("Stored workspace snapshot is empty.");
  const backup = JSON.stringify({
    format: "taskora.workspace-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: JSON.parse(serialized) as unknown,
  });
  const result = parseWorkspaceBackup(backup);
  if (!result.ok) throw new Error(`Stored workspace snapshot failed validation: ${result.error}`);
  return result.data;
}

function rowStatus(row: { revision: unknown; updated_at: unknown }): { revision: number; updatedAt: string } {
  const date = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? "");
  if (!Number.isFinite(Date.parse(date))) throw new Error("Stored workspace timestamp is invalid.");
  return { revision: normalizeWorkspaceRevision(row.revision), updatedAt: date };
}

export async function inspectPersonalWorkspace(userIdInput: string): Promise<WorkspaceStorageStatus> {
  assertWorkspaceStorageAvailable();
  const userId = requireUserId(userIdInput);
  const workspaceId = derivePersonalWorkspaceId(userId);
  const sql = await getSql();
  // Inspection is intentionally read-only: opening Settings must not create
  // a workspace before the user explicitly opts in to cloud persistence.
  const rows = await sql.query<{ revision: unknown; updated_at: unknown }>(
    `SELECT s.revision, s.updated_at
       FROM taskora_workspaces w
       JOIN taskora_workspace_memberships m
         ON m.workspace_id = w.id AND m.user_id = $2 AND m.role = 'owner'
       LEFT JOIN taskora_workspace_state s ON s.workspace_id = w.id
      WHERE w.id = $1 AND w.owner_user_id = $2 AND w.kind = 'personal'
      LIMIT 1`,
    [workspaceId, userId],
  );
  const base = { workspaceId, database: dbSource === "neon" ? "postgres" as const : "preview" as const };
  if (!rows.length || rows[0].revision == null) {
    return { ...base, hasSnapshot: false, revision: null, updatedAt: null };
  }
  return { ...base, hasSnapshot: true, ...rowStatus(rows[0]) };
}

export async function loadPersonalWorkspaceSnapshot(userIdInput: string): Promise<WorkspaceSnapshot | null> {
  assertWorkspaceStorageAvailable();
  const userId = requireUserId(userIdInput);
  const workspaceId = derivePersonalWorkspaceId(userId);
  const sql = await getSql();
  const rows = await sql.query<{ revision: unknown; updated_at: unknown; data: unknown }>(
    `SELECT s.revision, s.updated_at, s.data
       FROM taskora_workspaces w
       JOIN taskora_workspace_memberships m
         ON m.workspace_id = w.id AND m.user_id = $2 AND m.role = 'owner'
       JOIN taskora_workspace_state s ON s.workspace_id = w.id
      WHERE w.id = $1 AND w.owner_user_id = $2 AND w.kind = 'personal'
      LIMIT 1`,
    [workspaceId, userId],
  );
  if (!rows.length) return null;
  const status = rowStatus(rows[0]);
  return {
    workspaceId,
    database: dbSource === "neon" ? "postgres" : "preview",
    hasSnapshot: true,
    ...status,
    data: parseStoredData(rows[0].data),
  };
}

export async function initializePersonalWorkspaceSnapshot(
  userId: string,
  dataInput: unknown,
): Promise<WorkspaceSnapshot> {
  assertWorkspaceStorageAvailable();
  const userIdSafe = requireUserId(userId);
  const validated = validateWorkspaceSnapshot(dataInput);
  if (!validated.ok) throw new TypeError(`Invalid workspace snapshot: ${validated.error}`);
  const workspaceId = await ensurePersonalWorkspace(userIdSafe);
  const payload = JSON.stringify(validated.data);
  const payloadBytes = new TextEncoder().encode(payload).byteLength;
  const sql = await getSql();
  const inserted = await sql.query<{ revision: unknown }>(
    `WITH created AS (
       INSERT INTO taskora_workspace_state (workspace_id, revision, data, updated_by)
       VALUES ($1, 1, $2::jsonb, $3)
       ON CONFLICT (workspace_id) DO NOTHING
       RETURNING workspace_id, revision
     )
     INSERT INTO taskora_workspace_events (id, workspace_id, revision, actor_user_id, action, payload_bytes)
     SELECT $4, workspace_id, revision, $3, 'initialized', $5 FROM created
     RETURNING revision`,
    [workspaceId, payload, userIdSafe, randomUUID(), payloadBytes],
  );
  if (!inserted.length) {
    const current = await inspectPersonalWorkspace(userIdSafe);
    throw new WorkspaceSnapshotConflictError(current.revision);
  }
  const snapshot = await loadPersonalWorkspaceSnapshot(userIdSafe);
  if (!snapshot) throw new Error("Workspace snapshot was inserted but could not be loaded.");
  return snapshot;
}

export async function savePersonalWorkspaceSnapshot(input: {
  userId: string;
  workspaceId: string;
  expectedRevision: number;
  data: unknown;
}): Promise<{ revision: number; updatedAt: string }> {
  assertWorkspaceStorageAvailable();
  const userId = requireUserId(input.userId);
  const workspaceId = derivePersonalWorkspaceId(userId);
  if (input.workspaceId !== workspaceId) throw new WorkspaceAccessError();
  const expectedRevision = normalizeWorkspaceRevision(input.expectedRevision);
  const validated = validateWorkspaceSnapshot(input.data);
  if (!validated.ok) throw new TypeError(`Invalid workspace snapshot: ${validated.error}`);
  // Perform writes only after the caller, revision and full snapshot are valid.
  await ensurePersonalWorkspace(userId);
  const payload = JSON.stringify(validated.data);
  const payloadBytes = new TextEncoder().encode(payload).byteLength;
  const sql = await getSql();
  const rows = await sql.query<{ revision: unknown; updated_at: unknown }>(
    `WITH updated AS (
       UPDATE taskora_workspace_state
          SET data = $3::jsonb,
              revision = revision + 1,
              updated_by = $4,
              updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = $1 AND revision = $2
        RETURNING workspace_id, revision, updated_at
     ), logged AS (
       INSERT INTO taskora_workspace_events (id, workspace_id, revision, actor_user_id, action, payload_bytes)
       SELECT $5, workspace_id, revision, $4, 'snapshot_saved', $6 FROM updated
       RETURNING revision
     )
     SELECT updated.revision, updated.updated_at
       FROM updated JOIN logged USING (revision)`,
    [workspaceId, expectedRevision, payload, userId, randomUUID(), payloadBytes],
  );
  if (!rows.length) {
    const current = await inspectPersonalWorkspace(userId);
    throw new WorkspaceSnapshotConflictError(current.revision);
  }
  return {
    revision: normalizeWorkspaceRevision(rows[0].revision),
    updatedAt: rowStatus(rows[0]).updatedAt ?? new Date().toISOString(),
  };
}
