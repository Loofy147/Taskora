import { z } from "zod";

const MAX_ID_LENGTH = 200;
const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 100_000;
const MAX_ASSIGNEES = 1_000;

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const WorkspaceCapabilitySchema = z.enum([
  "workspace:read",
  "workspace:update",
  "workspace:transfer-owner",
  "project:read",
  "project:create",
  "project:update",
  "project:archive",
  "task:read",
  "task:create",
  "task:update",
  "task:archive",
  "task:assign",
  "subtask:create",
  "comment:create",
  "membership:invite",
  "membership:manage",
]);
export type WorkspaceCapability = z.infer<typeof WorkspaceCapabilitySchema>;

export const WORKSPACE_CAPABILITIES = WorkspaceCapabilitySchema.options;

export const ROLE_CAPABILITIES: Readonly<Record<WorkspaceRole, readonly WorkspaceCapability[]>> = {
  owner: WORKSPACE_CAPABILITIES,
  admin: WORKSPACE_CAPABILITIES.filter((capability) => capability !== "workspace:transfer-owner"),
  member: [
    "workspace:read",
    "project:read",
    "task:read",
    "task:create",
    "task:update",
    "subtask:create",
    "comment:create",
  ],
  viewer: ["workspace:read", "project:read", "task:read"],
};

/**
 * Evaluates the workspace role/capability matrix only.
 * Callers must resolve the role from a verified session plus active server-side
 * membership; never accept a role, actor ID, or membership status from a client.
 * Object-level rules (for example, whether a target assignee is in this
 * workspace) remain mandatory in the domain service.
 */
export function roleCan(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

const IdentifierSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);
const TitleSchema = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const DescriptionSchema = z.string().max(MAX_BODY_LENGTH);
const VersionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidInstant(value: string): boolean {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/,
  );
  if (!match || !isValidDateKey(match[1])) return false;

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
}

function isValidTimeZone(value: string): boolean {
  if (!value || value.trim() !== value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A real calendar date without a time or implicit timezone. */
export const DateKeySchema = z
  .string()
  .max(10)
  .refine(isValidDateKey, "Expected a valid YYYY-MM-DD calendar date.");

/** An absolute timestamp; a local timestamp without a UTC offset is rejected. */
export const InstantSchema = z
  .string()
  .max(64)
  .refine(isValidInstant, "Expected an ISO timestamp with a valid UTC offset.");

export const TaskStatusSchema = z.enum(["todo", "progress", "done"]);
export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export const ProjectStatusSchema = z.enum(["active", "paused", "done"]);

/**
 * Deadline dates and scheduled intervals are intentionally separate:
 * a due date does not imply that a task is scheduled for a specific time.
 */
export const ScheduleIntervalSchema = z
  .object({
    startsAt: InstantSchema,
    endsAt: InstantSchema,
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine(isValidTimeZone, "Expected a valid IANA timezone."),
  })
  .strict()
  .superRefine((interval, context) => {
    if (Date.parse(interval.endsAt) <= Date.parse(interval.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Schedule end must be later than its start.",
      });
    }
  });

export const WorkspaceMembershipSchema = z
  .object({
    workspaceId: IdentifierSchema,
    userId: IdentifierSchema,
    role: WorkspaceRoleSchema,
    status: z.enum(["active", "revoked"]),
    joinedAt: InstantSchema,
    revokedAt: InstantSchema.nullable(),
  })
  .strict()
  .superRefine((membership, context) => {
    if (membership.status === "active" && membership.revokedAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "An active membership cannot have a revocation timestamp.",
      });
    }
    if (membership.status === "revoked" && membership.revokedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "A revoked membership requires a revocation timestamp.",
      });
    }
    if (membership.role === "owner" && membership.status !== "active") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Workspace ownership cannot be represented by a revoked membership.",
      });
    }
  });

export const ProjectRecordSchema = z
  .object({
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    name: TitleSchema,
    description: DescriptionSchema,
    status: ProjectStatusSchema,
    createdById: IdentifierSchema,
    version: VersionSchema,
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    archivedAt: InstantSchema.nullable(),
  })
  .strict()
  .superRefine((project, context) => {
    if (Date.parse(project.updatedAt) < Date.parse(project.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "Project update time cannot precede its creation time.",
      });
    }
    if (project.archivedAt !== null && Date.parse(project.archivedAt) < Date.parse(project.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["archivedAt"],
        message: "Project archive time cannot precede its creation time.",
      });
    }
  });

export const TaskRecordSchema = z
  .object({
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    projectId: IdentifierSchema,
    title: TitleSchema,
    description: DescriptionSchema,
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: DateKeySchema.nullable(),
    schedule: ScheduleIntervalSchema.nullable(),
    assigneeIds: z
      .array(IdentifierSchema)
      .max(MAX_ASSIGNEES)
      .refine((ids) => new Set(ids).size === ids.length, "Task assignees must be unique."),
    createdById: IdentifierSchema,
    version: VersionSchema,
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    archivedAt: InstantSchema.nullable(),
  })
  .strict()
  .superRefine((task, context) => {
    if (Date.parse(task.updatedAt) < Date.parse(task.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "Task update time cannot precede its creation time.",
      });
    }
    if (task.archivedAt !== null && Date.parse(task.archivedAt) < Date.parse(task.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["archivedAt"],
        message: "Task archive time cannot precede its creation time.",
      });
    }
  });

export const SubtaskRecordSchema = z
  .object({
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    taskId: IdentifierSchema,
    title: TitleSchema,
    completed: z.boolean(),
    rank: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    version: VersionSchema,
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
  })
  .strict()
  .refine(
    (subtask) => Date.parse(subtask.updatedAt) >= Date.parse(subtask.createdAt),
    "Subtask update time cannot precede its creation time.",
  );

export const CommentRecordSchema = z
  .object({
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    taskId: IdentifierSchema,
    authorId: IdentifierSchema,
    body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
    version: VersionSchema,
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
  })
  .strict()
  .refine(
    (comment) => Date.parse(comment.updatedAt) >= Date.parse(comment.createdAt),
    "Comment update time cannot precede its creation time.",
  );

export const CreateTaskInputSchema = z
  .object({
    workspaceId: IdentifierSchema,
    projectId: IdentifierSchema,
    title: TitleSchema,
    description: DescriptionSchema,
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: DateKeySchema.nullable(),
    schedule: ScheduleIntervalSchema.nullable(),
    assigneeIds: z
      .array(IdentifierSchema)
      .max(MAX_ASSIGNEES)
      .refine((ids) => new Set(ids).size === ids.length, "Task assignees must be unique."),
  })
  .strict();


export const CreateProjectInputSchema = z
  .object({
    workspaceId: IdentifierSchema,
    name: TitleSchema,
    description: DescriptionSchema,
  })
  .strict();

export const ListTasksInputSchema = z
  .object({
    workspaceId: IdentifierSchema,
    limit: z.number().int().min(1).max(100).default(50),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    projectId: IdentifierSchema.optional(),
    assigneeId: IdentifierSchema.optional(),
    search: z.string().trim().max(200).optional(),
    cursor: z.string().min(1).max(1_000).optional(),
  })
  .strict();

export const GetTaskInputSchema = z
  .object({
    workspaceId: IdentifierSchema,
    taskId: IdentifierSchema,
  })
  .strict();

export const ArchiveTaskInputSchema = z
  .object({
    workspaceId: IdentifierSchema,
    taskId: IdentifierSchema,
    expectedVersion: VersionSchema,
  })
  .strict();

export const UpdateTaskInputSchema = z
  .object({
    workspaceId: IdentifierSchema,
    expectedVersion: VersionSchema,
    title: TitleSchema.optional(),
    description: DescriptionSchema.optional(),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    projectId: IdentifierSchema.optional(),
    dueDate: DateKeySchema.nullable().optional(),
    schedule: ScheduleIntervalSchema.nullable().optional(),
    assigneeIds: z
      .array(IdentifierSchema)
      .max(MAX_ASSIGNEES)
      .refine((ids) => new Set(ids).size === ids.length, "Task assignees must be unique.")
      .optional(),
  })
  .strict()
  .refine(
    (input) => Object.entries(input).some(([key, value]) => !["workspaceId", "expectedVersion"].includes(key) && value !== undefined),
    "At least one task field must be provided for an update.",
  );

export const WorkspaceDomainSnapshotSchema = z
  .object({
    tasks: z.array(TaskRecordSchema),
    projects: z.array(ProjectRecordSchema),
    memberships: z.array(WorkspaceMembershipSchema),
    subtasks: z.array(SubtaskRecordSchema),
    comments: z.array(CommentRecordSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const addIssue = (path: (string | number)[], message: string) => {
      context.addIssue({ code: "custom", path, message });
    };
    const checkUniqueIds = (items: Array<{ id: string }>, field: string) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) addIssue([field, index, "id"], "IDs must be unique within an entity collection.");
        seen.add(item.id);
      });
    };

    checkUniqueIds(snapshot.tasks, "tasks");
    checkUniqueIds(snapshot.projects, "projects");
    checkUniqueIds(snapshot.subtasks, "subtasks");
    checkUniqueIds(snapshot.comments, "comments");

    const membershipKeys = new Set<string>();
    const ownerCountByWorkspace = new Map<string, number>();
    const activeMemberships = new Set<string>();
    const membershipKey = (workspaceId: string, userId: string) => JSON.stringify([workspaceId, userId]);

    snapshot.memberships.forEach((membership, index) => {
      const key = membershipKey(membership.workspaceId, membership.userId);
      if (membershipKeys.has(key)) {
        addIssue(["memberships", index], "A user can have only one membership record per workspace.");
      }
      membershipKeys.add(key);
      if (membership.status === "active") activeMemberships.add(key);
      if (membership.role === "owner" && membership.status === "active") {
        ownerCountByWorkspace.set(
          membership.workspaceId,
          (ownerCountByWorkspace.get(membership.workspaceId) ?? 0) + 1,
        );
      }
    });

    const representedWorkspaces = new Set(snapshot.memberships.map((membership) => membership.workspaceId));
    for (const workspaceId of representedWorkspaces) {
      if (ownerCountByWorkspace.get(workspaceId) !== 1) {
        addIssue(["memberships"], "Each represented workspace must have exactly one active owner.");
      }
    }

    const projectsById = new Map(snapshot.projects.map((project) => [project.id, project] as const));
    const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task] as const));

    snapshot.projects.forEach((project, index) => {
      if (!activeMemberships.has(membershipKey(project.workspaceId, project.createdById))) {
        addIssue(["projects", index, "createdById"], "Project creator must be an active member of its workspace.");
      }
    });

    snapshot.tasks.forEach((task, index) => {
      const project = projectsById.get(task.projectId);
      if (!project) {
        addIssue(["tasks", index, "projectId"], "Task project does not exist.");
      } else if (project.workspaceId !== task.workspaceId) {
        addIssue(["tasks", index, "projectId"], "Task and project must belong to the same workspace.");
      }
      if (!activeMemberships.has(membershipKey(task.workspaceId, task.createdById))) {
        addIssue(["tasks", index, "createdById"], "Task creator must be an active member of its workspace.");
      }
      task.assigneeIds.forEach((assigneeId, assigneeIndex) => {
        if (!activeMemberships.has(membershipKey(task.workspaceId, assigneeId))) {
          addIssue(
            ["tasks", index, "assigneeIds", assigneeIndex],
            "Every assignee must be an active member of the same workspace.",
          );
        }
      });
    });

    snapshot.subtasks.forEach((subtask, index) => {
      const task = tasksById.get(subtask.taskId);
      if (!task) {
        addIssue(["subtasks", index, "taskId"], "Subtask parent task does not exist.");
      } else if (task.workspaceId !== subtask.workspaceId) {
        addIssue(["subtasks", index, "workspaceId"], "Subtask and parent task must belong to the same workspace.");
      }
    });

    snapshot.comments.forEach((comment, index) => {
      const task = tasksById.get(comment.taskId);
      if (!task) {
        addIssue(["comments", index, "taskId"], "Comment task does not exist.");
      } else if (task.workspaceId !== comment.workspaceId) {
        addIssue(["comments", index, "workspaceId"], "Comment and task must belong to the same workspace.");
      }
      if (!activeMemberships.has(membershipKey(comment.workspaceId, comment.authorId))) {
        addIssue(["comments", index, "authorId"], "Comment author must be an active member of the same workspace.");
      }
    });
  });

export type ScheduleInterval = z.infer<typeof ScheduleIntervalSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;
export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>;
export type SubtaskRecord = z.infer<typeof SubtaskRecordSchema>;
export type CommentRecord = z.infer<typeof CommentRecordSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type ListTasksInput = z.infer<typeof ListTasksInputSchema>;
export type GetTaskInput = z.infer<typeof GetTaskInputSchema>;
export type ArchiveTaskInput = z.infer<typeof ArchiveTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;
export type WorkspaceDomainSnapshot = z.infer<typeof WorkspaceDomainSnapshotSchema>;
