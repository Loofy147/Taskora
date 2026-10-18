import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  ArchiveTaskInputSchema,
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  GetTaskInputSchema,
  InstantSchema,
  ListTasksInputSchema,
  ProjectRecordSchema,
  TaskRecordSchema,
  UpdateTaskInputSchema,
  roleCan,
  type ProjectRecord,
  type TaskRecord,
  type WorkspaceRole,
} from "./domain-contracts.ts";
import { getSql, type Sql } from "./db.ts";

export class TaskoraDomainError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "TaskoraDomainError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function parseInput<T>(parse: (input: unknown) => T, input: unknown): T {
  try {
    return parse(input);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const issues = error.issues.map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? path + ": " + issue.message : issue.message;
    });
    throw new TaskoraDomainError(400, "INVALID_INPUT", issues.join("; "), { issues });
  }
}

function requireActor(actorUserId: string): string {
  if (typeof actorUserId !== "string" || actorUserId.trim().length === 0 || actorUserId.length > 512) {
    throw new TaskoraDomainError(401, "UNAUTHENTICATED", "A verified user session is required.");
  }
  return actorUserId;
}

function requireCapability(role: WorkspaceRole, capability: Parameters<typeof roleCan>[1]): void {
  if (!roleCan(role, capability)) {
    throw new TaskoraDomainError(403, "FORBIDDEN", "Your workspace role does not allow this operation.");
  }
}

async function activeWorkspaceRole(tx: Sql, workspaceId: string, actorUserId: string): Promise<WorkspaceRole> {
  const rows = await tx.query<{ role: string }>(
    "SELECT role FROM taskora_workspace_memberships " +
      "WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' FOR SHARE",
    [workspaceId, actorUserId],
  );
  const role = rows[0]?.role;
  if (role !== "owner" && role !== "admin" && role !== "member" && role !== "viewer") {
    throw new TaskoraDomainError(403, "WORKSPACE_ACCESS_DENIED", "You are not an active member of this workspace.");
  }
  return role;
}

async function assertProjectAvailable(tx: Sql, workspaceId: string, projectId: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    "SELECT id FROM taskora_projects " +
      "WHERE workspace_id = $1 AND id = $2 AND archived_at IS NULL FOR SHARE",
    [workspaceId, projectId],
  );
  if (!rows.length) {
    throw new TaskoraDomainError(404, "PROJECT_NOT_FOUND", "The project does not exist in this workspace or is archived.");
  }
}

async function assertActiveAssignees(tx: Sql, workspaceId: string, assigneeIds: string[]): Promise<void> {
  if (assigneeIds.length === 0) return;
  const rows = await tx.query<{ user_id: string }>(
    "SELECT user_id FROM taskora_workspace_memberships " +
      "WHERE workspace_id = $1 AND user_id = ANY($2::text[]) AND status = 'active' " +
      "ORDER BY user_id FOR SHARE",
    [workspaceId, assigneeIds],
  );
  if (rows.length !== assigneeIds.length) {
    throw new TaskoraDomainError(403, "INVALID_ASSIGNEE", "Every assignee must be an active member of this workspace.");
  }
}

function assertAssignmentAllowed(
  role: WorkspaceRole,
  actorUserId: string,
  nextAssignees: string[],
  currentAssignees?: string[],
): void {
  if (roleCan(role, "task:assign")) return;
  if (nextAssignees.some((id) => id !== actorUserId)) {
    throw new TaskoraDomainError(403, "TASK_ASSIGNMENT_FORBIDDEN", "Your role cannot assign tasks to other members.");
  }
  if (currentAssignees) {
    const same =
      currentAssignees.length === nextAssignees.length &&
      currentAssignees.every((id) => nextAssignees.includes(id));
    if (!same && currentAssignees.some((id) => id !== actorUserId)) {
      throw new TaskoraDomainError(403, "TASK_ASSIGNMENT_FORBIDDEN", "Your role cannot change another member's assignment.");
    }
  }
}

function asIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new TaskoraDomainError(500, "INVALID_STORED_TIMESTAMP", "Stored timestamp is invalid.");
  }
  return date.toISOString();
}

function toProject(row: Record<string, unknown>): ProjectRecord {
  return ProjectRecordSchema.parse({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    description: String(row.description),
    status: String(row.status),
    createdById: String(row.created_by_user_id),
    version: Number(row.version),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    archivedAt: row.archived_at === null ? null : asIso(row.archived_at),
  });
}

function toTask(row: Record<string, unknown>, assigneeIds: string[]): TaskRecord {
  let schedule: { startsAt: string; endsAt: string; timeZone: string } | null = null;
  if (row.scheduled_start_at !== null || row.scheduled_end_at !== null || row.scheduled_timezone !== null) {
    if (row.scheduled_start_at === null || row.scheduled_end_at === null || row.scheduled_timezone === null) {
      throw new TaskoraDomainError(500, "INVALID_STORED_SCHEDULE", "Stored schedule interval is incomplete.");
    }
    schedule = {
      startsAt: asIso(row.scheduled_start_at),
      endsAt: asIso(row.scheduled_end_at),
      timeZone: String(row.scheduled_timezone),
    };
  }
  return TaskRecordSchema.parse({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    title: String(row.title),
    description: String(row.description),
    status: String(row.status),
    priority: String(row.priority),
    dueDate: row.due_date === null ? null : String(row.due_date),
    schedule,
    assigneeIds,
    createdById: String(row.created_by_user_id),
    version: Number(row.version),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    archivedAt: row.archived_at === null ? null : asIso(row.archived_at),
  });
}

async function readAssignees(tx: Sql, workspaceId: string, taskIds: string[]): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (taskIds.length === 0) return grouped;
  const rows = await tx.query<{ task_id: string; user_id: string }>(
    "SELECT task_id, user_id FROM taskora_task_assignees " +
      "WHERE workspace_id = $1 AND task_id = ANY($2::text[]) ORDER BY task_id, user_id",
    [workspaceId, taskIds],
  );
  for (const row of rows) {
    const ids = grouped.get(row.task_id) ?? [];
    ids.push(row.user_id);
    grouped.set(row.task_id, ids);
  }
  return grouped;
}

function encodeCursor(row: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify({ createdAt: asIso(row.created_at), id: String(row.id) }), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    const value = parsed as Record<string, unknown>;
    if (typeof value.id !== "string" || value.id.trim().length === 0 || value.id.length > 200) {
      throw new Error("invalid id");
    }
    const createdAt = InstantSchema.parse(value.createdAt);
    if (Object.keys(value).some((key) => key !== "id" && key !== "createdAt")) throw new Error("unknown field");
    return { createdAt, id: value.id };
  } catch {
    throw new TaskoraDomainError(400, "INVALID_CURSOR", "The task-list cursor is malformed.");
  }
}

export async function createProject(actorInput: string, rawInput: unknown): Promise<ProjectRecord> {
  const actorUserId = requireActor(actorInput);
  const input = parseInput(CreateProjectInputSchema.parse.bind(CreateProjectInputSchema), rawInput);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const role = await activeWorkspaceRole(tx, input.workspaceId, actorUserId);
    requireCapability(role, "project:create");
    const rows = await tx.query<Record<string, unknown>>(
      "INSERT INTO taskora_projects (id, workspace_id, name, description, status, created_by_user_id, version) " +
        "VALUES ($1, $2, $3, $4, 'active', $5, 1) RETURNING *",
      [randomUUID(), input.workspaceId, input.name, input.description, actorUserId],
    );
    if (!rows[0]) throw new TaskoraDomainError(500, "PROJECT_CREATE_FAILED", "Project creation returned no record.");
    return toProject(rows[0]);
  });
}

export async function listProjects(actorInput: string, workspaceIdInput: string): Promise<ProjectRecord[]> {
  const actorUserId = requireActor(actorInput);
  const workspaceId = parseInput(GetTaskInputSchema.parse.bind(GetTaskInputSchema), {
    workspaceId: workspaceIdInput,
    taskId: "unused",
  }).workspaceId;
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const role = await activeWorkspaceRole(tx, workspaceId, actorUserId);
    requireCapability(role, "project:read");
    const rows = await tx.query<Record<string, unknown>>(
      "SELECT * FROM taskora_projects WHERE workspace_id = $1 AND archived_at IS NULL " +
        "ORDER BY created_at DESC, id DESC",
      [workspaceId],
    );
    return rows.map(toProject);
  });
}

export async function createTask(actorInput: string, rawInput: unknown): Promise<TaskRecord> {
  const actorUserId = requireActor(actorInput);
  const input = parseInput(CreateTaskInputSchema.parse.bind(CreateTaskInputSchema), rawInput);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const role = await activeWorkspaceRole(tx, input.workspaceId, actorUserId);
    requireCapability(role, "task:create");
    assertAssignmentAllowed(role, actorUserId, input.assigneeIds);
    await assertProjectAvailable(tx, input.workspaceId, input.projectId);
    await assertActiveAssignees(tx, input.workspaceId, input.assigneeIds);

    const rows = await tx.query<Record<string, unknown>>(
      "INSERT INTO taskora_tasks (" +
        "id, workspace_id, project_id, title, description, status, priority, due_date, " +
        "scheduled_start_at, scheduled_end_at, scheduled_timezone, created_by_user_id, version" +
        ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::timestamptz, $10::timestamptz, $11, $12, 1) RETURNING *",
      [
        randomUUID(),
        input.workspaceId,
        input.projectId,
        input.title,
        input.description,
        input.status,
        input.priority,
        input.dueDate,
        input.schedule?.startsAt ?? null,
        input.schedule?.endsAt ?? null,
        input.schedule?.timeZone ?? null,
        actorUserId,
      ],
    );
    const row = rows[0];
    if (!row) throw new TaskoraDomainError(500, "TASK_CREATE_FAILED", "Task creation returned no record.");
    if (input.assigneeIds.length > 0) {
      await tx.query(
        "INSERT INTO taskora_task_assignees (workspace_id, task_id, user_id) " +
          "SELECT $1, $2, unnest($3::text[])",
        [input.workspaceId, String(row.id), input.assigneeIds],
      );
    }
    return toTask(row, input.assigneeIds);
  });
}

export async function getTask(actorInput: string, rawInput: unknown): Promise<TaskRecord> {
  const actorUserId = requireActor(actorInput);
  const input = parseInput(GetTaskInputSchema.parse.bind(GetTaskInputSchema), rawInput);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const role = await activeWorkspaceRole(tx, input.workspaceId, actorUserId);
    requireCapability(role, "task:read");
    const rows = await tx.query<Record<string, unknown>>(
      "SELECT * FROM taskora_tasks WHERE workspace_id = $1 AND id = $2 AND archived_at IS NULL",
      [input.workspaceId, input.taskId],
    );
    const row = rows[0];
    if (!row) throw new TaskoraDomainError(404, "TASK_NOT_FOUND", "The task was not found in this workspace.");
    const assignees = await readAssignees(tx, input.workspaceId, [input.taskId]);
    return toTask(row, assignees.get(input.taskId) ?? []);
  });
}

export async function listTasks(actorInput: string, rawInput: unknown): Promise<{ items: TaskRecord[]; nextCursor: string | null }> {
  const actorUserId = requireActor(actorInput);
  const input = parseInput(ListTasksInputSchema.parse.bind(ListTasksInputSchema), rawInput);
  const cursor = decodeCursor(input.cursor);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const role = await activeWorkspaceRole(tx, input.workspaceId, actorUserId);
    requireCapability(role, "task:read");
    const rows = await tx.query<Record<string, unknown>>(
      "SELECT t.* FROM taskora_tasks t " +
        "WHERE t.workspace_id = $1 AND t.archived_at IS NULL " +
        "AND ($2::text IS NULL OR t.status = $2) " +
        "AND ($3::text IS NULL OR t.priority = $3) " +
        "AND ($4::text IS NULL OR t.project_id = $4) " +
        "AND ($5::text IS NULL OR t.title ILIKE '%' || $5 || '%' OR t.description ILIKE '%' || $5 || '%') " +
        "AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM taskora_task_assignees a " +
        "WHERE a.workspace_id = t.workspace_id AND a.task_id = t.id AND a.user_id = $6)) " +
        "AND ($7::timestamptz IS NULL OR $8::text IS NULL OR (t.created_at, t.id) < ($7::timestamptz, $8::text)) " +
        "ORDER BY t.created_at DESC, t.id DESC LIMIT $9",
      [
        input.workspaceId,
        input.status ?? null,
        input.priority ?? null,
        input.projectId ?? null,
        input.search || null,
        input.assigneeId ?? null,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        input.limit + 1,
      ],
    );
    const hasMore = rows.length > input.limit;
    const visibleRows = hasMore ? rows.slice(0, input.limit) : rows;
    const assignees = await readAssignees(tx, input.workspaceId, visibleRows.map((row) => String(row.id)));
    const items = visibleRows.map((row) => {
      const id = String(row.id);
      return toTask(row, assignees.get(id) ?? []);
    });
    return {
      items,
      nextCursor: hasMore ? encodeCursor(visibleRows[visibleRows.length - 1]) : null,
    };
  });
}

export async function updateTask(actorInput: string, taskIdInput: string, rawInput: unknown): Promise<TaskRecord> {
  const actorUserId = requireActor(actorInput);
  const input = parseInput(UpdateTaskInputSchema.parse.bind(UpdateTaskInputSchema), rawInput);
  if (taskIdInput !== input.taskId) {
    throw new TaskoraDomainError(400, "INVALID_INPUT", "Route task ID must match the validated request task ID.");
  }
  const taskId = input.taskId;
  const sql = await getSql();

  return sql.transaction(async (tx) => {
    const role = await activeWorkspaceRole(tx, input.workspaceId, actorUserId);
    requireCapability(role, "task:update");
    const currentRows = await tx.query<Record<string, unknown>>(
      "SELECT * FROM taskora_tasks WHERE workspace_id = $1 AND id = $2 AND archived_at IS NULL FOR UPDATE",
      [input.workspaceId, taskId],
    );
    const current = currentRows[0];
    if (!current) throw new TaskoraDomainError(404, "TASK_NOT_FOUND", "The task was not found in this workspace.");
    const currentVersion = Number(current.version);
    if (currentVersion !== input.expectedVersion) {
      throw new TaskoraDomainError(409, "TASK_VERSION_CONFLICT", "The task changed since it was loaded.", {
        expectedVersion: input.expectedVersion,
        currentVersion,
      });
    }

    const currentAssigneesMap = await readAssignees(tx, input.workspaceId, [taskId]);
    const currentAssignees = currentAssigneesMap.get(taskId) ?? [];
    const nextAssignees = input.assigneeIds ?? currentAssignees;
    if (input.assigneeIds !== undefined) {
      assertAssignmentAllowed(role, actorUserId, nextAssignees, currentAssignees);
      await assertActiveAssignees(tx, input.workspaceId, nextAssignees);
    }
    const nextProjectId = input.projectId ?? String(current.project_id);
    if (input.projectId !== undefined && input.projectId !== String(current.project_id)) {
      await assertProjectAvailable(tx, input.workspaceId, nextProjectId);
    }

    const nextSchedule =
      input.schedule === undefined
        ? { start: current.scheduled_start_at, end: current.scheduled_end_at, timeZone: current.scheduled_timezone }
        : {
            start: input.schedule?.startsAt ?? null,
            end: input.schedule?.endsAt ?? null,
            timeZone: input.schedule?.timeZone ?? null,
          };
    const updatedRows = await tx.query<Record<string, unknown>>(
      "UPDATE taskora_tasks SET project_id = $3, title = $4, description = $5, status = $6, priority = $7, " +
        "due_date = $8::date, scheduled_start_at = $9::timestamptz, scheduled_end_at = $10::timestamptz, " +
        "scheduled_timezone = $11, version = version + 1, updated_at = CURRENT_TIMESTAMP " +
        "WHERE workspace_id = $1 AND id = $2 AND version = $12 AND archived_at IS NULL RETURNING *",
      [
        input.workspaceId,
        taskId,
        nextProjectId,
        input.title ?? String(current.title),
        input.description ?? String(current.description),
        input.status ?? String(current.status),
        input.priority ?? String(current.priority),
        input.dueDate === undefined ? current.due_date : input.dueDate,
        nextSchedule.start,
        nextSchedule.end,
        nextSchedule.timeZone,
        input.expectedVersion,
      ],
    );
    if (!updatedRows[0]) {
      throw new TaskoraDomainError(409, "TASK_VERSION_CONFLICT", "The task changed before the update could be saved.");
    }
    if (input.assigneeIds !== undefined) {
      await tx.query("DELETE FROM taskora_task_assignees WHERE workspace_id = $1 AND task_id = $2", [
        input.workspaceId,
        taskId,
      ]);
      if (nextAssignees.length > 0) {
        await tx.query(
          "INSERT INTO taskora_task_assignees (workspace_id, task_id, user_id) " +
            "SELECT $1, $2, unnest($3::text[])",
          [input.workspaceId, taskId, nextAssignees],
        );
      }
    }
    return toTask(updatedRows[0], nextAssignees);
  });
}

export async function archiveTask(actorInput: string, rawInput: unknown): Promise<TaskRecord> {
  const actorUserId = requireActor(actorInput);
  const input = parseInput(ArchiveTaskInputSchema.parse.bind(ArchiveTaskInputSchema), rawInput);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const role = await activeWorkspaceRole(tx, input.workspaceId, actorUserId);
    requireCapability(role, "task:archive");
    const currentRows = await tx.query<Record<string, unknown>>(
      "SELECT * FROM taskora_tasks WHERE workspace_id = $1 AND id = $2 AND archived_at IS NULL FOR UPDATE",
      [input.workspaceId, input.taskId],
    );
    const current = currentRows[0];
    if (!current) throw new TaskoraDomainError(404, "TASK_NOT_FOUND", "The task was not found in this workspace.");
    const currentVersion = Number(current.version);
    if (currentVersion !== input.expectedVersion) {
      throw new TaskoraDomainError(409, "TASK_VERSION_CONFLICT", "The task changed since it was loaded.", {
        expectedVersion: input.expectedVersion,
        currentVersion,
      });
    }
    const updated = await tx.query<Record<string, unknown>>(
      "UPDATE taskora_tasks SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 " +
        "WHERE workspace_id = $1 AND id = $2 AND version = $3 AND archived_at IS NULL RETURNING *",
      [input.workspaceId, input.taskId, input.expectedVersion],
    );
    if (!updated[0]) throw new TaskoraDomainError(409, "TASK_VERSION_CONFLICT", "The task changed before archiving.");
    const assignees = await readAssignees(tx, input.workspaceId, [input.taskId]);
    return toTask(updated[0], assignees.get(input.taskId) ?? []);
  });
}
