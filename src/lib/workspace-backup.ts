import type { Attachment, Comment, Member, Notice, Project, Settings, Subtask, Task } from "./types.ts";

export const WORKSPACE_BACKUP_FORMAT = "taskora.workspace-backup" as const;
export const WORKSPACE_BACKUP_VERSION = 1 as const;
export const MAX_WORKSPACE_BACKUP_BYTES = 10 * 1024 * 1024;

const MAX_ITEMS = 10_000;
const MAX_NAME = 500;
const MAX_TEXT = 100_000;
const STATUSES = new Set<Task["status"]>(["todo", "progress", "done"]);
const PRIORITIES = new Set<Task["priority"]>(["high", "medium", "low"]);
const TONES = new Set<Task["tone"]>(["blue", "green", "amber", "rose"]);
const ATTACHMENT_KINDS = new Set<Attachment["kind"]>(["sheet", "archive", "image", "doc", "pdf"]);
const PROJECT_STATUSES = new Set<Project["status"]>(["active", "paused", "done"]);
const WEEK_STARTS = new Set<Settings["weekStart"]>(["sun", "mon"]);
const DENSITIES = new Set<Settings["density"]>(["comfortable", "compact"]);

export interface WorkspaceBackupData {
  tasks: Task[];
  projects: Project[];
  members: Member[];
  notifications: Notice[];
  settings: Settings;
}

export type WorkspaceBackupParseResult =
  | { ok: true; data: WorkspaceBackupData; exportedAt: string }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isString = (
  value: unknown,
  max = MAX_TEXT,
  { allowEmpty = true }: { allowEmpty?: boolean } = {},
): value is string =>
  typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);

const isDateKey = (value: unknown): value is string => {
  if (!isString(value, 10, { allowEmpty: false }) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isIsoTimestamp = (value: unknown): value is string => {
  if (!isString(value, 64, { allowEmpty: false })) return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match || !isDateKey(match[1])) return false;

  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const zone = match[5];
  const zoneHour = Number(match[7]);
  const zoneMinute = Number(match[8]);
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== "Z" && (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0))) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
};

const uniqueIds = (items: unknown): boolean => {
  if (!Array.isArray(items)) return false;
  const ids = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || !isString(item.id, 200, { allowEmpty: false }) || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
};

const all = <T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.length <= MAX_ITEMS && value.every(predicate);

const idSet = (items: ReadonlyArray<{ id: string }>) => new Set(items.map((item) => item.id));

function validMember(value: unknown): value is Member {
  return isRecord(value) &&
    isString(value.id, 200, { allowEmpty: false }) &&
    isString(value.name, MAX_NAME, { allowEmpty: false }) &&
    isString(value.role, 200, { allowEmpty: false }) &&
    isString(value.title, 200, { allowEmpty: false }) &&
    isString(value.email, 320, { allowEmpty: false }) &&
    Number.isInteger(value.tone) && typeof value.tone === "number" && value.tone >= 0 && value.tone <= 3;
}

function validProject(value: unknown): value is Project {
  return isRecord(value) &&
    isString(value.id, 200, { allowEmpty: false }) &&
    isString(value.name, MAX_NAME, { allowEmpty: false }) &&
    isString(value.description) &&
    isString(value.status) && PROJECT_STATUSES.has(value.status as Project["status"]);
}

function validSubtask(value: unknown): value is Subtask {
  return isRecord(value) &&
    isString(value.id, 200, { allowEmpty: false }) &&
    isString(value.title, MAX_NAME, { allowEmpty: false }) &&
    typeof value.done === "boolean";
}

function validComment(value: unknown): value is Comment {
  return isRecord(value) &&
    isString(value.id, 200, { allowEmpty: false }) &&
    isString(value.authorId, 200, { allowEmpty: false }) &&
    isString(value.body, MAX_TEXT, { allowEmpty: false }) &&
    isIsoTimestamp(value.at);
}

function validAttachment(value: unknown): value is Attachment {
  return isRecord(value) &&
    isString(value.id, 200, { allowEmpty: false }) &&
    isString(value.name, MAX_NAME, { allowEmpty: false }) &&
    isString(value.size, 100, { allowEmpty: false }) &&
    isString(value.kind) && ATTACHMENT_KINDS.has(value.kind as Attachment["kind"]);
}

function validTask(value: unknown): value is Task {
  return isRecord(value) &&
    isString(value.id, 200, { allowEmpty: false }) &&
    isString(value.title, MAX_NAME, { allowEmpty: false }) &&
    isString(value.summary) &&
    isString(value.description) &&
    isString(value.status) && STATUSES.has(value.status as Task["status"]) &&
    isString(value.priority) && PRIORITIES.has(value.priority as Task["priority"]) &&
    isString(value.projectId, 200, { allowEmpty: false }) &&
    isDateKey(value.due) &&
    Array.isArray(value.assigneeIds) &&
    value.assigneeIds.length <= 1_000 &&
    value.assigneeIds.every((id: unknown) => isString(id, 200, { allowEmpty: false })) &&
    isString(value.createdById, 200, { allowEmpty: false }) &&
    isString(value.icon, 100, { allowEmpty: false }) &&
    isString(value.tone) && TONES.has(value.tone as Task["tone"]) &&
    all(value.subtasks, validSubtask) && uniqueIds(value.subtasks) &&
    all(value.comments, validComment) && uniqueIds(value.comments) &&
    all(value.attachments, validAttachment) && uniqueIds(value.attachments) &&
    isIsoTimestamp(value.createdAt) &&
    typeof value.rank === "number" && Number.isFinite(value.rank);
}

function validNotice(value: unknown): value is Notice {
  return isRecord(value) &&
    isString(value.id, 200, { allowEmpty: false }) &&
    isString(value.title, MAX_NAME, { allowEmpty: false }) &&
    isString(value.body) &&
    isIsoTimestamp(value.at) &&
    typeof value.read === "boolean" &&
    (value.taskId === undefined || isString(value.taskId, 200, { allowEmpty: false }));
}

function validateData(data: unknown): string | null {
  if (!isRecord(data)) return "Backup data is missing or malformed.";
  const { tasks, projects, members, notifications, settings } = data;
  if (!all(projects, validProject) || !uniqueIds(projects)) return "Projects are malformed or contain duplicate IDs.";
  if (!all(members, validMember) || !uniqueIds(members)) return "Team members are malformed or contain duplicate IDs.";
  if (!members.some((member) => member.id === "hichem")) return "This backup does not contain the required local profile.";
  if (!all(tasks, validTask) || !uniqueIds(tasks)) return "Tasks are malformed or contain duplicate IDs.";
  if (!all(notifications, validNotice) || !uniqueIds(notifications)) return "Notifications are malformed or contain duplicate IDs.";
  if (!isRecord(settings) ||
      !isString(settings.weekStart) || !WEEK_STARTS.has(settings.weekStart as Settings["weekStart"]) ||
      !isString(settings.density) || !DENSITIES.has(settings.density as Settings["density"]) ||
      typeof settings.digest !== "boolean") {
    return "Workspace settings are malformed.";
  }

  const projectIds = idSet(projects);
  const memberIds = idSet(members);
  const taskIds = idSet(tasks);
  for (const task of tasks) {
    if (!projectIds.has(task.projectId)) return `Task “${task.title}” refers to a missing project.`;
    if (!memberIds.has(task.createdById)) return `Task “${task.title}” refers to a missing creator.`;
    if (task.assigneeIds.some((id) => !memberIds.has(id))) return `Task “${task.title}” refers to a missing assignee.`;
    if (task.comments.some((comment) => !memberIds.has(comment.authorId))) {
      return `Task “${task.title}” has a comment by a missing member.`;
    }
    if (new Set(task.assigneeIds).size !== task.assigneeIds.length) {
      return `Task “${task.title}” has duplicate assignees.`;
    }
  }
  for (const notice of notifications) {
    if (notice.taskId && !taskIds.has(notice.taskId)) {
      return `Notification “${notice.title}” refers to a missing task.`;
    }
  }
  return null;
}

/** Validate a backup JSON string without changing the active workspace. */
export function parseWorkspaceBackup(text: string): WorkspaceBackupParseResult {
  if (typeof text !== "string") return { ok: false, error: "Choose a valid Taskora backup file." };
  if (new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BACKUP_BYTES) {
    return { ok: false, error: "Backup exceeds the 10 MB import limit." };
  }

  let backup: unknown;
  try {
    backup = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "The selected file is not valid JSON." };
  }
  if (!isRecord(backup) || backup.format !== WORKSPACE_BACKUP_FORMAT) {
    return { ok: false, error: "This file is not a Taskora workspace backup." };
  }
  if (backup.version !== WORKSPACE_BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version: ${String(backup.version)}.` };
  }
  if (!isIsoTimestamp(backup.exportedAt)) return { ok: false, error: "Backup export timestamp is invalid." };

  const issue = validateData(backup.data);
  if (issue) return { ok: false, error: issue };

  return {
    ok: true,
    data: JSON.parse(JSON.stringify(backup.data)) as WorkspaceBackupData,
    exportedAt: backup.exportedAt,
  };
}

/** Build a versioned JSON backup after validating the workspace data. */
export function createWorkspaceBackup(data: WorkspaceBackupData, exportedAt = new Date().toISOString()): string {
  if (!isIsoTimestamp(exportedAt)) throw new TypeError("Backup export timestamp must be a valid ISO timestamp.");
  const issue = validateData(data);
  if (issue) throw new TypeError(`Cannot export invalid workspace data: ${issue}`);
  const backup = {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt,
    data: {
      tasks: data.tasks,
      projects: data.projects,
      members: data.members,
      notifications: data.notifications,
      settings: data.settings,
    },
  };
  const text = JSON.stringify(backup, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BACKUP_BYTES) {
    throw new TypeError("Workspace is too large to export as a single backup (10 MB limit).");
  }
  return text;
}

export function countWorkspaceBackupRecords(
  data: Pick<WorkspaceBackupData, "tasks" | "projects" | "members" | "notifications">,
) {
  return {
    tasks: data.tasks.length,
    projects: data.projects.length,
    members: data.members.length,
    notifications: data.notifications.length,
  };
}
