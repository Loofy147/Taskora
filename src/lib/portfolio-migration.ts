/**
 * One-time migration from the original demo catalog to the canonical Taskora
 * portfolio. Preserve user-created records; remove only exact fixture IDs.
 */
type Row = Record<string, unknown>;
type StateShape<TTask extends object, TProject extends object, TMember extends object, TNotice extends object, TSettings> = {
  tasks: TTask[];
  projects: TProject[];
  members: TMember[];
  notifications: TNotice[];
  settings: TSettings;
};

const LEGACY_TASK_IDS = new Set([
  "task-catalog", "task-report", "task-followup", "task-banner", "task-inventory",
  "task-supplier", "task-website", "task-marketing", "task-support", "task-finance",
  "task-workspace", "task-logo", "task-social", "task-backup", "task-meeting",
]);
const LEGACY_PROJECT_IDS = new Set(["ecom", "brand", "growth", "ops", "finance", "success"]);
const LEGACY_MEMBER_IDS = new Set(["sara", "amine", "lina", "karim", "nora"]);
const LEGACY_NOTICE_IDS = new Set(["n-1", "n-2", "n-3", "n-4"]);
const OWNER_ID = "hichem";

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}
function idOf(row: Row): string | null {
  return typeof row.id === "string" && row.id.length > 0 ? row.id : null;
}
function exampleEmail(value: unknown): boolean {
  return typeof value === "string" && /@example\.com$/i.test(value.trim());
}

export function migratePortfolioState<TTask extends object, TProject extends object, TMember extends object, TNotice extends object, TSettings>(
  persisted: unknown,
  baseline: StateShape<TTask, TProject, TMember, TNotice, TSettings>,
): StateShape<TTask, TProject, TMember, TNotice, TSettings> {
  const saved = isRow(persisted) ? persisted : {};
  const retainedTasks = rows(saved.tasks).filter((task) => !LEGACY_TASK_IDS.has(idOf(task) ?? ""));
  const taskMap = new Map<string, TTask>();

  for (const task of rows(baseline.tasks)) {
    const id = idOf(task);
    if (id) taskMap.set(id, task as unknown as TTask);
  }
  for (const task of retainedTasks) {
    const id = idOf(task);
    if (id) taskMap.set(id, task as unknown as TTask); // Existing edits win over a seed default.
  }
  const tasks = [...taskMap.values()];
  const taskRows = tasks as unknown as Row[];
  const referencedProjectIds = new Set(
    taskRows.map((task) => task.projectId).filter((id): id is string => typeof id === "string"),
  );

  const projectMap = new Map<string, TProject>();
  for (const project of rows(baseline.projects)) {
    const id = idOf(project);
    if (id) projectMap.set(id, project as unknown as TProject);
  }
  for (const project of rows(saved.projects)) {
    const id = idOf(project);
    if (!id) continue;
    if (LEGACY_PROJECT_IDS.has(id)) {
      if (referencedProjectIds.has(id)) {
        const name = typeof project.name === "string" ? project.name : id;
        const oldDescription = typeof project.description === "string" ? project.description : "";
        projectMap.set(id, {
          ...project,
          name: "Recovered legacy project — " + name + " (review)",
          description: oldDescription + "\n\nThis old sample project was retained only because a preserved task references it. Review and reassign the task before removing this project.",
          status: "active",
        } as unknown as TProject);
      }
      continue;
    }
    projectMap.set(id, project as unknown as TProject);
  }

  const referencedMemberIds = new Set<string>();
  for (const task of taskRows) {
    if (typeof task.createdById === "string") referencedMemberIds.add(task.createdById);
    if (Array.isArray(task.assigneeIds)) {
      for (const memberId of task.assigneeIds) if (typeof memberId === "string") referencedMemberIds.add(memberId);
    }
    if (Array.isArray(task.comments)) {
      for (const comment of task.comments) {
        if (isRow(comment) && typeof comment.authorId === "string") referencedMemberIds.add(comment.authorId);
      }
    }
  }

  const memberMap = new Map<string, TMember>();
  for (const member of rows(baseline.members)) {
    const id = idOf(member);
    if (id) memberMap.set(id, member as unknown as TMember);
  }
  for (const member of rows(saved.members)) {
    const id = idOf(member);
    if (!id) continue;
    if (id === OWNER_ID) {
      const name = typeof member.name === "string" ? member.name.trim() : "";
      const hasCustomProfile = name.length > 0 && name !== "Hichem";
      const custom = { ...member };
      if (exampleEmail(custom.email)) custom.email = "";
      const baselineOwner = memberMap.get(id);
      if (hasCustomProfile) {
        memberMap.set(id, { ...(isRow(baselineOwner) ? baselineOwner : {}), ...custom, id } as unknown as TMember);
      }
      continue;
    }
    if (LEGACY_MEMBER_IDS.has(id)) {
      if (referencedMemberIds.has(id)) {
        memberMap.set(id, {
          id,
          name: "Legacy collaborator — identity unverified",
          role: "Needs identity confirmation",
          title: "Legacy assignee; verify before sharing",
          email: "",
          tone: 0,
        } as unknown as TMember);
      }
      continue;
    }
    const copy = { ...member };
    if (exampleEmail(copy.email)) copy.email = "";
    memberMap.set(id, copy as unknown as TMember);
  }

  const knownTaskIds = new Set(taskRows.map(idOf).filter((id): id is string => Boolean(id)));
  const notificationMap = new Map<string, TNotice>();
  for (const notice of rows(baseline.notifications)) {
    const id = idOf(notice);
    if (id) notificationMap.set(id, notice as unknown as TNotice);
  }
  for (const notice of rows(saved.notifications)) {
    const id = idOf(notice);
    if (!id || LEGACY_NOTICE_IDS.has(id)) continue;
    if (typeof notice.taskId === "string" && !knownTaskIds.has(notice.taskId)) continue;
    notificationMap.set(id, notice as unknown as TNotice);
  }

  return {
    tasks,
    projects: [...projectMap.values()],
    members: [...memberMap.values()],
    notifications: [...notificationMap.values()],
    settings: isRow(saved.settings) ? saved.settings as TSettings : baseline.settings,
  };
}
