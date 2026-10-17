import { isOverdue, todayKey } from "@/lib/format";
import { ME, type Member, type Priority, type Project, type Quick, type Scope, type SortKey, type Task } from "@/lib/types";

const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export interface FilterInput {
  tasks: Task[];
  projects: Project[];
  members: Member[];
  scope: Scope;
  quick: Quick;
  query: string;
  projectId: string | null;
  memberId: string | null;
  calendarDay: string | null;
  sort: SortKey;
}

export function matchesTask(task: Task, opts: FilterInput) {
  const today = todayKey();
  if (opts.projectId && task.projectId !== opts.projectId) return false;
  if (opts.memberId && !task.assigneeIds.includes(opts.memberId)) return false;
  if (opts.calendarDay && task.due !== opts.calendarDay) return false;
  if (opts.scope === "mine" && !(task.assigneeIds.includes(ME) || task.createdById === ME)) return false;
  if (opts.scope === "assigned" && task.assigneeIds.length === 0) return false;
  if (opts.scope === "created" && task.createdById !== ME) return false;
  if (opts.quick === "mine" && !(task.assigneeIds.includes(ME) || task.createdById === ME)) return false;
  if (opts.quick === "assigned" && !task.assigneeIds.includes(ME)) return false;
  if (opts.quick === "today" && !(task.due === today && task.status !== "done")) return false;
  if (opts.quick === "overdue" && !isOverdue(task.due, task.status)) return false;
  if (opts.quick === "high" && !(task.priority === "high" && task.status !== "done")) return false;
  const q = opts.query.trim().toLowerCase();
  if (q) {
    const project = opts.projects.find((p) => p.id === task.projectId);
    const people = opts.members.filter((m) => task.assigneeIds.includes(m.id) || m.id === task.createdById);
    const hay = [task.title, task.summary, task.description, project?.name ?? "", ...people.map((p) => p.name)]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function sortTasks(tasks: Task[], sort: SortKey) {
  return [...tasks].sort((a, b) => {
    if (sort === "due") return a.due.localeCompare(b.due) || a.rank - b.rank;
    if (sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority] || a.due.localeCompare(b.due);
    if (sort === "title") return a.title.localeCompare(b.title);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function visibleTasks(opts: FilterInput) {
  return sortTasks(
    opts.tasks.filter((task) => matchesTask(task, opts)),
    opts.sort,
  );
}

export function scopeCount(tasks: Task[], scope: Scope) {
  if (scope === "all") return tasks.length;
  if (scope === "mine") return tasks.filter((t) => t.assigneeIds.includes(ME) || t.createdById === ME).length;
  if (scope === "assigned") return tasks.filter((t) => t.assigneeIds.length > 0).length;
  return tasks.filter((t) => t.createdById === ME).length;
}
