import type { Member, Notice, Project, Settings, Task } from "./types.ts";
import type { WorkspaceBackupData } from "./workspace-backup.ts";

export type WorkspaceMergeCounts = {
  addedTasks: number;
  addedProjects: number;
  addedMembers: number;
  addedNotifications: number;
  enrichedTasks: number;
  enrichedProjects: number;
};

export type WorkspaceMergeResult = {
  data: WorkspaceBackupData;
  counts: WorkspaceMergeCounts;
};

function sourceUrl(description: string): string | null {
  const match = description.match(/Source record:\s*(https?:\/\/[^\s]+)/i);
  return match?.[1]?.replace(/[),.;]+$/, "") ?? null;
}

function enrichDescription(existing: string, incoming: string): string {
  const source = sourceUrl(incoming);
  if (source && existing.includes(source)) return existing;
  if (!incoming.trim() || existing.includes(incoming.trim())) return existing;
  return existing.trim() ? existing.trim() + "\n\nImported source context:\n" + incoming.trim() : incoming.trim();
}

/**
 * Add records from a validated backup without overwriting existing user state.
 * Stable IDs make repeated imports idempotent. Matching IDs keep the existing
 * title, status, due date, priority, assignments and settings; only missing
 * source context is appended to the description.
 */
export function mergeWorkspaceRecords(
  existing: WorkspaceBackupData,
  incoming: WorkspaceBackupData,
): WorkspaceMergeResult {
  const counts: WorkspaceMergeCounts = {
    addedTasks: 0, addedProjects: 0, addedMembers: 0, addedNotifications: 0,
    enrichedTasks: 0, enrichedProjects: 0,
  };

  const projectsById = new Map<string, Project>(existing.projects.map((item) => [item.id, { ...item }]));
  for (const project of incoming.projects) {
    const current = projectsById.get(project.id);
    if (!current) {
      projectsById.set(project.id, { ...project });
      counts.addedProjects += 1;
      continue;
    }
    const description = enrichDescription(current.description, project.description);
    if (description !== current.description) {
      projectsById.set(project.id, { ...current, description });
      counts.enrichedProjects += 1;
    }
  }

  const membersById = new Map<string, Member>(existing.members.map((item) => [item.id, { ...item }]));
  for (const member of incoming.members) {
    if (membersById.has(member.id)) continue;
    membersById.set(member.id, { ...member });
    counts.addedMembers += 1;
  }

  const tasksById = new Map<string, Task>(existing.tasks.map((item) => [item.id, { ...item }]));
  for (const task of incoming.tasks) {
    const current = tasksById.get(task.id);
    if (!current) {
      tasksById.set(task.id, { ...task });
      counts.addedTasks += 1;
      continue;
    }
    const description = enrichDescription(current.description, task.description);
    if (description !== current.description) {
      tasksById.set(task.id, { ...current, description });
      counts.enrichedTasks += 1;
    }
  }

  const noticesById = new Map<string, Notice>(existing.notifications.map((item) => [item.id, { ...item }]));
  for (const notice of incoming.notifications) {
    if (noticesById.has(notice.id)) continue;
    noticesById.set(notice.id, { ...notice });
    counts.addedNotifications += 1;
  }

  return {
    data: {
      tasks: [...tasksById.values()],
      projects: [...projectsById.values()],
      members: [...membersById.values()],
      notifications: [...noticesById.values()],
      settings: { ...existing.settings } as Settings,
    },
    counts,
  };
}
