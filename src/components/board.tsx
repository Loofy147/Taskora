import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Calendar, MoreHorizontal, Plus, X } from "lucide-react";
import { AvatarStack, PriorityPill, STATUS_LABEL, TaskGlyph } from "@/components/bits";
import { SortMenu } from "@/components/shell";
import { formatDay, isOverdue } from "@/lib/format";
import { scopeCount, visibleTasks } from "@/lib/filters";
import { useApp } from "@/lib/store";
import type { Scope, Status, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLUMNS: { id: Status; label: string; head: string }[] = [
  { id: "todo", label: "To Do", head: "bg-todo text-todo-ink" },
  { id: "progress", label: "In Progress", head: "bg-progress text-progress-ink" },
  { id: "done", label: "Done", head: "bg-done text-done-ink" },
];

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All Tasks" },
  { id: "mine", label: "My Tasks" },
  { id: "assigned", label: "Assigned" },
  { id: "created", label: "Created by Me" },
];

export function Board() {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const members = useApp((s) => s.members);
  const scope = useApp((s) => s.scope);
  const quick = useApp((s) => s.quick);
  const query = useApp((s) => s.query);
  const projectId = useApp((s) => s.projectId);
  const memberId = useApp((s) => s.memberId);
  const calendarDay = useApp((s) => s.calendarDay);
  const sort = useApp((s) => s.sort);
  const visible = visibleTasks({ tasks, projects, members, scope, quick, query, projectId, memberId, calendarDay, sort });
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const open = visible.filter((t) => t.status !== "done").length;
  const progress = visible.filter((t) => t.status === "progress").length;
  const late = visible.filter((t) => isOverdue(t.due, t.status)).length;
  const rate = visible.length === 0 ? 0 : Math.round((visible.filter((t) => t.status === "done").length / visible.length) * 100);

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3 lg:px-5 lg:py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Shared Tasks</h1>
          <p className="mt-1 text-sm text-muted">Local prototype data only — shared synchronization and invitations are not connected yet.</p>
        </div>
        <button
          type="button"
          onClick={() => useApp.getState().openComposer("todo")}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-ink"
        >
          <Plus className="size-4" />
          New Task
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Open" value={String(open)} />
        <Stat label="In progress" value={String(progress)} />
        <Stat label="Overdue" value={String(late)} tone={late > 0 ? "late" : "ok"} />
        <Stat label="Completed" value={`${rate}%`} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {SCOPES.map((item) => {
            const active = scope === item.id && quick === "none";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => useApp.getState().setScope(item.id)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium",
                  active ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "grid min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold",
                    active ? "bg-primary-fg/20 text-primary-fg" : "bg-surface text-muted",
                  )}
                >
                  {scopeCount(tasks, item.id)}
                </span>
              </button>
            );
          })}
        </div>
        <SortMenu />
      </div>

      <FilterChips />

      <div className="board-gap mt-3 flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto lg:grid lg:grid-cols-3 lg:overflow-visible">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            status={column.id}
            label={column.label}
            head={column.head}
            tasks={visible.filter((task) => task.status === column.id)}
            hot={dragOver === column.id}
            onDragOver={() => setDragOver(column.id)}
            onDragLeave={() => setDragOver((current) => (current === column.id ? null : current))}
            onDrop={() => setDragOver(null)}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "late" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("text-lg font-bold", tone === "late" && "text-high-ink")}>{value}</p>
    </div>
  );
}

function FilterChips() {
  const quick = useApp((s) => s.quick);
  const projectId = useApp((s) => s.projectId);
  const memberId = useApp((s) => s.memberId);
  const calendarDay = useApp((s) => s.calendarDay);
  const query = useApp((s) => s.query);
  const projects = useApp((s) => s.projects);
  const members = useApp((s) => s.members);
  const chips: { label: string; clear: () => void }[] = [];
  if (quick !== "none") {
    const labels = { mine: "My tasks", assigned: "Assigned to me", today: "Due today", overdue: "Overdue", high: "High priority" };
    chips.push({ label: labels[quick], clear: () => useApp.getState().setQuick("none") });
  }
  if (projectId) chips.push({ label: projects.find((p) => p.id === projectId)?.name ?? "Project", clear: () => useApp.getState().setProjectFilter(null) });
  if (memberId) chips.push({ label: members.find((m) => m.id === memberId)?.name ?? "Teammate", clear: () => useApp.getState().setMemberFilter(null) });
  if (calendarDay) chips.push({ label: formatDay(calendarDay, "MMM d"), clear: () => useApp.getState().setCalendarDay(null) });
  if (query.trim()) chips.push({ label: `“${query.trim()}”`, clear: () => useApp.getState().setQuery("") });
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button key={chip.label} type="button" onClick={chip.clear} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary-soft px-2.5 text-xs font-semibold text-primary-ink">
          {chip.label}
          <X className="size-3" />
        </button>
      ))}
      <button type="button" onClick={() => useApp.getState().clearFilters()} className="text-xs font-semibold text-muted hover:text-fg">
        Clear all
      </button>
    </div>
  );
}

function Column({
  status,
  label,
  head,
  tasks,
  hot,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  status: Status;
  label: string;
  head: string;
  tasks: Task[];
  hot: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  return (
    <section className="flex w-10/12 shrink-0 snap-start flex-col lg:w-auto lg:min-w-0">
      <header className={cn("flex items-center justify-between rounded-xl px-3 py-2.5", head)}>
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="grid min-w-6 place-items-center rounded-full bg-surface px-1.5 text-xs font-bold">{tasks.length}</span>
      </header>
      <div
        className={cn("board-gap mt-2 flex min-h-40 flex-1 flex-col gap-2.5 overflow-y-auto rounded-2xl p-1", hot && "bg-primary-soft")}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver();
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          if (id) useApp.getState().moveTask(id, status);
          onDrop();
        }}
      >
        {tasks.length === 0 && <p className="px-2 py-6 text-center text-xs text-faint">Nothing in {label.toLowerCase()}.</p>}
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        <button
          type="button"
          onClick={() => useApp.getState().openComposer(status)}
          className="mt-1 inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-dashed border-line text-sm text-muted hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" />
          Add task
        </button>
      </div>
    </section>
  );
}

function TaskCard({ task }: { task: Task }) {
  const members = useApp((s) => s.members);
  const selected = useApp((s) => s.selectedId === task.id && s.detailsOpen);
  const late = isOverdue(task.due, task.status);
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => useApp.getState().selectTask(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          useApp.getState().selectTask(task.id);
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "task-card cursor-grab rounded-2xl border bg-surface p-3 text-left shadow-card active:cursor-grabbing",
        selected ? "border-primary ring-2 ring-primary/20" : "border-line hover:border-primary/30",
      )}
    >
      <div className="flex items-start gap-2.5">
        <TaskGlyph task={task} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug">{task.title}</h3>
            <CardMenu task={task} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{task.summary}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <PriorityPill priority={task.priority} />
          <p className={cn("mt-1.5 flex items-center gap-1 text-xs", late ? "font-semibold text-high-ink" : "text-faint")}>
            <Calendar className="size-3.5" />
            {formatDay(task.due, "MMM d, yyyy")}
          </p>
        </div>
        <AvatarStack ids={task.assigneeIds} members={members} />
      </div>
    </article>
  );
}

function CardMenu({ task }: { task: Task }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Actions for ${task.title}`}
        onClick={(e) => e.stopPropagation()}
        className="grid size-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-chip hover:text-fg"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 rounded-xl border border-line bg-surface p-1 shadow-pop" onClick={(e) => e.stopPropagation()}>
          {(["todo", "progress", "done"] as Status[]).map((status) => (
            <DropdownMenu.Item
              key={status}
              disabled={task.status === status}
              onSelect={() => useApp.getState().moveTask(task.id, status)}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-disabled:opacity-40 data-highlighted:bg-chip"
            >
              Move to {STATUS_LABEL[status]}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item
            onSelect={() => useApp.getState().duplicateTask(task.id)}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-chip"
          >
            Duplicate
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => useApp.getState().askDelete(task.id)}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm text-high-ink outline-none data-highlighted:bg-high"
          >
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
