import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarStack, FileGlyph, Meter, PriorityPill, STATUS_LABEL, StatusPill } from "@/components/bits";
import { SortMenu } from "@/components/shell";
import { formatDay, formatStamp, isOverdue, shiftDay, todayKey } from "@/lib/format";
import { visibleTasks } from "@/lib/filters";
import { useApp } from "@/lib/store";
import { WorkspaceSyncPanel } from "@/components/workspace-sync-panel";
import { countWorkspaceBackupRecords, createWorkspaceBackup, MAX_WORKSPACE_BACKUP_BYTES, parseWorkspaceBackup } from "@/lib/workspace-backup.ts";
import type { WorkspaceBackupData } from "@/lib/workspace-backup.ts";
import type { AttachmentKind, Status } from "@/lib/types";
import { cn } from "@/lib/utils";

function Page({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-3 py-4 lg:px-6 lg:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function ListView() {
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
  const rows = visibleTasks({ tasks, projects, members, scope, quick, query, projectId, memberId, calendarDay, sort });

  return (
    <Page
      title="Tasks"
      subtitle="Every task in one list. Open a row for the full brief, or change status without leaving the page."
      action={
        <div className="flex items-center gap-2">
          <SortMenu />
          <button type="button" onClick={() => useApp.getState().openComposer()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">
            <Plus className="size-4" />
            New Task
          </button>
        </div>
      }
    >
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-chip text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Task</th>
              <th className="px-3 py-3 font-semibold">Project</th>
              <th className="px-3 py-3 font-semibold">Priority</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Due</th>
              <th className="px-3 py-3 font-semibold">People</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((task) => {
              const project = projects.find((item) => item.id === task.projectId);
              const late = isOverdue(task.due, task.status);
              return (
                <tr key={task.id} className="cursor-pointer border-t border-line hover:bg-chip" onClick={() => useApp.getState().selectTask(task.id)}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{task.title}</p>
                    <p className="line-clamp-1 text-xs text-muted">{task.summary}</p>
                  </td>
                  <td className="px-3 py-3 text-muted">{project?.name}</td>
                  <td className="px-3 py-3">
                    <PriorityPill priority={task.priority} />
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      onChange={(e) => useApp.getState().moveTask(task.id, e.target.value as Status)}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold"
                    >
                      {(Object.keys(STATUS_LABEL) as Status[]).map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cn("px-3 py-3 text-xs", late ? "font-semibold text-high-ink" : "text-muted")}>{formatDay(task.due)}</td>
                  <td className="px-3 py-3">
                    <AvatarStack ids={task.assigneeIds} members={members} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No tasks match.</p>}
      </div>
      <ul className="space-y-2 lg:hidden">
        {rows.map((task) => (
          <li key={task.id}>
            <button type="button" onClick={() => useApp.getState().selectTask(task.id)} className="w-full rounded-2xl border border-line bg-surface p-3 text-left shadow-card">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{task.title}</span>
                <StatusPill status={task.status} />
              </span>
              <span className="mt-1 block text-xs text-muted">{task.summary}</span>
              <span className="mt-2 flex items-center justify-between">
                <PriorityPill priority={task.priority} />
                <span className={cn("text-xs", isOverdue(task.due, task.status) ? "font-semibold text-high-ink" : "text-faint")}>{formatDay(task.due, "MMM d")}</span>
              </span>
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">No tasks match.</li>}
      </ul>
    </Page>
  );
}

export function ProjectsView() {
  const projects = useApp((s) => s.projects);
  const tasks = useApp((s) => s.tasks);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Page
      title="Projects"
      subtitle="Group the work. Open a project to see only its tasks on the board."
      action={
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">
          <Plus className="size-4" />
          New project
        </button>
      }
    >
      {open && (
        <form
          className="mb-4 grid gap-2 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Name the project.");
              return;
            }
            useApp.getState().addProject({ name, description });
            setName("");
            setDescription("");
            setOpen(false);
            toast.success("Project created");
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="h-11 rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it for?" className="h-11 rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" />
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">
              Save project
            </button>
          </div>
        </form>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const mine = tasks.filter((task) => task.projectId === project.id);
          const done = mine.filter((task) => task.status === "done").length;
          return (
            <article key={project.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{project.name}</h2>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", project.status === "active" ? "bg-done text-done-ink" : project.status === "paused" ? "bg-medium text-medium-ink" : "bg-chip text-muted")}>
                  {project.status}
                </span>
              </div>
              <p className="mt-1 flex-1 text-sm text-muted">{project.description}</p>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>
                    {done}/{mine.length} done
                  </span>
                  <span>{mine.filter((task) => isOverdue(task.due, task.status)).length} overdue</span>
                </div>
                <Meter value={done} max={mine.length} />
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => useApp.getState().setProjectFilter(project.id)} className="min-h-10 flex-1 rounded-xl bg-primary-soft text-sm font-semibold text-primary-ink">
                  Open on board
                </button>
                <button
                  type="button"
                  onClick={() => useApp.getState().setProjectStatus(project.id, project.status === "active" ? "paused" : "active")}
                  className="min-h-10 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-chip"
                >
                  {project.status === "active" ? "Pause" : "Resume"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

export function TeamView() {
  const members = useApp((s) => s.members);
  const tasks = useApp((s) => s.tasks);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Page
      title="Team"
      subtitle="Review the sample team and workload. Adding a teammate here does not send an invitation."
      action={
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">
          <Plus className="size-4" />
          Add teammate
        </button>
      }
    >
      {open && (
        <form
          className="mb-4 grid gap-2 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Name your teammate.");
              return;
            }
            useApp.getState().addMember({ name, role, email });
            setName("");
            setRole("");
            setEmail("");
            setOpen(false);
            toast.success("Sample teammate added in this browser");
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-11 rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="h-11 rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-11 rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" />
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">
              Save teammate
            </button>
          </div>
        </form>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => {
          const mine = tasks.filter((task) => task.assigneeIds.includes(member.id));
          const openTasks = mine.filter((task) => task.status !== "done").length;
          const done = mine.filter((task) => task.status === "done").length;
          return (
            <article key={member.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center gap-3">
                <Avatar member={member} size="lg" />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{member.name}</h2>
                  <p className="text-xs text-muted">{member.title}</p>
                  <a href={`mailto:${member.email}`} className="text-xs text-primary">
                    {member.email}
                  </a>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-chip py-2">
                  <dt className="text-xs text-muted">Open</dt>
                  <dd className="font-bold">{openTasks}</dd>
                </div>
                <div className="rounded-xl bg-chip py-2">
                  <dt className="text-xs text-muted">Done</dt>
                  <dd className="font-bold">{done}</dd>
                </div>
                <div className="rounded-xl bg-chip py-2">
                  <dt className="text-xs text-muted">Late</dt>
                  <dd className="font-bold text-high-ink">{mine.filter((task) => isOverdue(task.due, task.status)).length}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <Meter value={done} max={mine.length} />
              </div>
              <button type="button" onClick={() => useApp.getState().setMemberFilter(member.id)} className="mt-3 min-h-10 w-full rounded-xl bg-primary-soft text-sm font-semibold text-primary-ink">
                View tasks
              </button>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

export function CalendarView() {
  const tasks = useApp((s) => s.tasks);
  const weekStart = useApp((s) => s.settings.weekStart);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(todayKey);
  const weekStartsOn = weekStart === "mon" ? 1 : 0;
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn }),
  });
  const labels = weekStartsOn === 1 ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const agenda = tasks.filter((task) => task.due === selected).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Page title="Calendar" subtitle="Due dates across the month. Pick a day to see what lands there.">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-line bg-surface p-3 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="grid size-11 place-items-center rounded-xl hover:bg-chip" aria-label="Previous month" onClick={() => setCursor((d) => subMonths(d, 1))}>
              <ChevronLeft className="size-5" />
            </button>
            <h2 className="text-sm font-bold">{format(cursor, "MMMM yyyy")}</h2>
            <button type="button" className="grid size-11 place-items-center rounded-xl hover:bg-chip" aria-label="Next month" onClick={() => setCursor((d) => addMonths(d, 1))}>
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-faint">
            {labels.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const mine = tasks.filter((task) => task.due === key);
              const isToday = key === todayKey();
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={cn(
                    "flex min-h-14 flex-col items-center rounded-xl px-1 py-1 text-xs",
                    isSameMonth(day, cursor) ? "text-fg" : "text-faint",
                    isToday && "bg-primary text-primary-fg",
                    isSelected && !isToday && "bg-primary-soft text-primary-ink",
                  )}
                >
                  <span className="font-semibold">{format(day, "d")}</span>
                  <span className="mt-1 flex gap-0.5">
                    {mine.slice(0, 3).map((task) => (
                      <span key={task.id} className={cn("size-1.5 rounded-full", task.status === "done" ? "bg-done-ink" : task.status === "progress" ? "bg-progress-ink" : "bg-primary", isToday && "bg-primary-fg")} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 lg:col-span-2">
          <h2 className="font-semibold">{formatDay(selected)}</h2>
          <p className="text-xs text-muted">{agenda.length === 0 ? "Nothing due." : `${agenda.length} task${agenda.length === 1 ? "" : "s"} due`}</p>
          <ul className="mt-3 space-y-2">
            {agenda.map((task) => (
              <li key={task.id}>
                <button type="button" onClick={() => useApp.getState().selectTask(task.id)} className="w-full rounded-xl border border-line px-3 py-2 text-left hover:border-primary">
                  <span className="block text-sm font-semibold">{task.title}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <StatusPill status={task.status} />
                    <PriorityPill priority={task.priority} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => useApp.getState().setCalendarDay(selected)} className="mt-4 min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-fg">
            Show this day on the board
          </button>
        </div>
      </div>
    </Page>
  );
}

const FILE_FILTERS: { id: "all" | AttachmentKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sheet", label: "Sheets" },
  { id: "image", label: "Images" },
  { id: "pdf", label: "PDFs" },
  { id: "archive", label: "Archives" },
  { id: "doc", label: "Docs" },
];

export function FilesView() {
  const tasks = useApp((s) => s.tasks);
  const [kind, setKind] = useState<(typeof FILE_FILTERS)[number]["id"]>("all");
  const query = useApp((s) => s.query).trim().toLowerCase();
  const files = tasks.flatMap((task) => task.attachments.map((file) => ({ ...file, task }))).filter((file) => (kind === "all" || file.kind === kind) && (!query || file.name.toLowerCase().includes(query) || file.task.title.toLowerCase().includes(query)));

  return (
    <Page title="File references" subtitle="Browse file names listed on tasks. File uploads and downloads are not connected in this prototype.">
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {FILE_FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => setKind(item.id)} className={cn("min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold", kind === item.id ? "bg-primary text-primary-fg" : "bg-surface text-muted")}>
            {item.label}
          </button>
        ))}
      </div>
      {files.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">No files in this view.</p>}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {files.map((file) => (
          <li key={file.id}>
            <button type="button" onClick={() => useApp.getState().selectTask(file.task.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left shadow-card hover:border-primary">
              <FileGlyph kind={file.kind} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{file.name}</span>
                <span className="block truncate text-xs text-muted">
                  {file.size} · {file.task.title}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function ReportsView() {
  const tasks = useApp((s) => s.tasks);
  const members = useApp((s) => s.members);
  const projects = useApp((s) => s.projects);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const done = tasks.filter((task) => task.status === "done").length;
  const late = tasks.filter((task) => isOverdue(task.due, task.status)).length;
  const soon = tasks.filter((task) => task.status !== "done" && task.due >= todayKey() && task.due <= shiftDay(7)).length;
  const rate = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);
  const statusData = [
    { name: "To Do", value: tasks.filter((task) => task.status === "todo").length, fill: "var(--color-primary)" },
    { name: "In Progress", value: tasks.filter((task) => task.status === "progress").length, fill: "var(--color-progress-ink)" },
    { name: "Done", value: done, fill: "var(--color-done-ink)" },
  ];
  const people = members.map((member) => ({
    name: member.name.split(" ")[0],
    todo: tasks.filter((task) => task.assigneeIds.includes(member.id) && task.status === "todo").length,
    progress: tasks.filter((task) => task.assigneeIds.includes(member.id) && task.status === "progress").length,
    done: tasks.filter((task) => task.assigneeIds.includes(member.id) && task.status === "done").length,
  }));
  const priority = [
    { name: "High", value: tasks.filter((task) => task.priority === "high").length, fill: "var(--color-high-ink)" },
    { name: "Medium", value: tasks.filter((task) => task.priority === "medium").length, fill: "var(--color-medium-ink)" },
    { name: "Low", value: tasks.filter((task) => task.priority === "low").length, fill: "var(--color-primary)" },
  ];
  const pulse = useMemo(
    () =>
      tasks
        .flatMap((task) => task.comments.map((comment) => ({ ...comment, taskTitle: task.title, taskId: task.id })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 5),
    [tasks],
  );

  return (
    <Page title="Reports" subtitle="A read on load, lateness, and who is carrying what — from the tasks on this board.">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Completion" value={`${rate}%`} />
        <Kpi label="Overdue" value={String(late)} warn={late > 0} />
        <Kpi label="Due in 7 days" value={String(soon)} />
        <Kpi label="Active projects" value={String(projects.filter((project) => project.status === "active").length)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Tasks by status">
          {ready && (
            <ChartBox>
              {(width) => (
                <BarChart width={width} height={220} data={statusData}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip cursor={{ fill: "var(--color-chip)" }} contentStyle={{ borderRadius: 12, borderColor: "var(--color-line)", fontSize: 12 }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ChartBox>
          )}
        </ChartCard>
        <ChartCard title="Priority mix">
          {ready && (
            <ChartBox>
              {(width) => (
                <PieChart width={width} height={220}>
                  <Pie data={priority} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3}>
                    {priority.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "var(--color-line)", fontSize: 12 }} />
                </PieChart>
              )}
            </ChartBox>
          )}
          <ul className="mt-2 flex justify-center gap-3 text-xs text-muted">
            {priority.map((item) => (
              <li key={item.name} className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: item.fill }} />
                {item.name} {item.value}
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>
      <div className="mt-3">
        <ChartCard title="Load by teammate">
          {ready && (
            <ChartBox>
              {(width) => (
                <BarChart width={width} height={240} data={people}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "var(--color-line)", fontSize: 12 }} />
                  <Bar dataKey="todo" stackId="a" fill="var(--color-primary)" />
                  <Bar dataKey="progress" stackId="a" fill="var(--color-progress-ink)" />
                  <Bar dataKey="done" stackId="a" fill="var(--color-done-ink)" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ChartBox>
          )}
        </ChartCard>
      </div>
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Latest comments</h2>
        <ul className="mt-3 divide-y divide-line">
          {pulse.length === 0 && <li className="py-3 text-sm text-muted">No comments yet.</li>}
          {pulse.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => useApp.getState().selectTask(item.taskId)} className="w-full py-3 text-left">
                <span className="text-xs text-faint">{formatStamp(item.at)} · {item.taskTitle}</span>
                <span className="mt-1 block text-sm">{item.body}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}

function Kpi({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", warn && "text-high-ink")}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ChartBox({ children }: { children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-56 w-full">
      {width > 0 ? children(width) : null}
    </div>
  );
}

export function SettingsView() {
  const me = useApp((s) => s.members.find((member) => member.id === "hichem"));
  const settings = useApp((s) => s.settings);
  const [confirm, setConfirm] = useState(false);
  const [hydrated, setHydrated] = useState(() => useApp.persist.hasHydrated());
  const [pendingImport, setPendingImport] = useState<{
    data: WorkspaceBackupData;
    exportedAt: string;
    counts: { tasks: number; projects: number; members: number; notifications: number };
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = useApp.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useApp.persist.hasHydrated());
    return unsubscribe;
  }, []);

  const exportBackup = () => {
    if (!useApp.persist.hasHydrated()) {
      toast.error("Workspace data is still loading. Try again in a moment.");
      return;
    }
    try {
      const state = useApp.getState();
      const data: WorkspaceBackupData = {
        tasks: state.tasks,
        projects: state.projects,
        members: state.members,
        notifications: state.notifications,
        settings: state.settings,
      };
      const text = createWorkspaceBackup(data);
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `taskora-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success("Workspace backup downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export workspace backup");
    }
  };

  const handleBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (!useApp.persist.hasHydrated()) {
      input.value = "";
      toast.error("Workspace data is still loading. Try again after it finishes.");
      return;
    }
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_WORKSPACE_BACKUP_BYTES) {
      toast.error("Backup exceeds the 10 MB import limit.");
      return;
    }
    try {
      const result = parseWorkspaceBackup(await file.text());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPendingImport({ data: result.data, exportedAt: result.exportedAt, counts: countWorkspaceBackupRecords(result.data) });
    } catch {
      toast.error("Could not read the selected backup file.");
    }
  };

  const restoreBackup = () => {
    if (!pendingImport) return;
    useApp.getState().replaceWorkspaceData(pendingImport.data);
    setPendingImport(null);
    toast.success("Workspace restored from backup");
  };

  return (
    <Page title="Settings" subtitle="Your workspace is stored locally by default. Cloud persistence is an explicit, opt-in choice.">
      <div className="grid max-w-2xl gap-3">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Your profile</h2>
          <label className="mt-3 block text-sm font-medium">
            Display name
            <input value={me?.name ?? ""} onChange={(e) => useApp.getState().renameMe(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" />
          </label>
          <p className="mt-2 text-xs text-muted">{me?.email} · {me?.role}</p>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Workspace</h2>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Week starts Monday</p>
              <p className="text-xs text-muted">Used by the calendar.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.weekStart === "mon"}
              onClick={() => useApp.getState().setSettings({ weekStart: settings.weekStart === "mon" ? "sun" : "mon" })}
              className={cn("relative h-7 w-12 rounded-full", settings.weekStart === "mon" ? "bg-primary" : "bg-line")}
            >
              <span className={cn("absolute top-0.5 size-6 rounded-full bg-surface transition", settings.weekStart === "mon" ? "left-5" : "left-0.5")} />
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Compact cards</p>
              <p className="text-xs text-muted">Tighter task cards on the board.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.density === "compact"}
              onClick={() => useApp.getState().setSettings({ density: settings.density === "compact" ? "comfortable" : "compact" })}
              className={cn("relative h-7 w-12 rounded-full", settings.density === "compact" ? "bg-primary" : "bg-line")}
            >
              <span className={cn("absolute top-0.5 size-6 rounded-full bg-surface transition", settings.density === "compact" ? "left-5" : "left-0.5")} />
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Daily digest</p>
              <p className="text-xs text-muted">A preference only — no email is sent from this demo.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.digest}
              onClick={() => useApp.getState().setSettings({ digest: !settings.digest })}
              className={cn("relative h-7 w-12 rounded-full", settings.digest ? "bg-primary" : "bg-line")}
            >
              <span className={cn("absolute top-0.5 size-6 rounded-full bg-surface transition", settings.digest ? "left-5" : "left-0.5")} />
            </button>
          </div>
        </section>
        <WorkspaceSyncPanel />
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Data backup</h2>
          <p className="mt-1 text-sm text-muted">Export a versioned JSON snapshot or restore one created by Taskora. Import is validated before it can replace the current browser data.</p>
          <p className="mt-2 text-xs text-muted">Backups include task descriptions, comments, team names and email addresses, and file-reference metadata. They do not contain file contents and are not encrypted; store them securely. If cloud sync is enabled, restoring a backup will also sync the restored state to the server.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!hydrated} onClick={exportBackup} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-50">
              Export backup
            </button>
            <button type="button" disabled={!hydrated} onClick={() => importRef.current?.click()} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Choose backup to restore
            </button>
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" disabled={!hydrated} onChange={handleBackupFile} />
          </div>
          {!hydrated && <p className="mt-2 text-xs text-muted">Loading the saved workspace before enabling backup actions…</p>}
          {pendingImport && hydrated && (
            <div className="mt-4 rounded-xl border border-high bg-high/20 p-3" role="status">
              <p className="text-sm font-semibold">Backup validated — confirmation required</p>
              <p className="mt-1 text-xs text-muted">Exported {new Date(pendingImport.exportedAt).toLocaleString()}. This will replace the current local data with {pendingImport.counts.tasks} tasks, {pendingImport.counts.projects} projects, {pendingImport.counts.members} members, and {pendingImport.counts.notifications} notifications.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={restoreBackup} className="min-h-10 rounded-xl bg-high-ink px-3 text-sm font-semibold text-primary-fg">Replace current data</button>
                <button type="button" onClick={() => setPendingImport(null)} className="min-h-10 rounded-xl px-3 text-sm font-semibold">Cancel</button>
              </div>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Shortcuts</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li><kbd className="font-semibold text-fg">N</kbd> new task</li>
            <li><kbd className="font-semibold text-fg">/</kbd> search</li>
            <li><kbd className="font-semibold text-fg">Esc</kbd> close the panel</li>
          </ul>
        </section>
        <section className="rounded-2xl border border-high bg-high/40 p-4">
          <h2 className="font-semibold text-high-ink">Reset demo</h2>
          <p className="mt-1 text-sm text-muted">Puts the sample catalog, team, and dates back. Your browser edits are lost; if cloud sync is active, the reset state will also be saved to the server. Export a backup first if you need to preserve either copy.</p>
          {confirm ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl bg-high-ink px-4 text-sm font-semibold text-primary-fg"
                onClick={() => {
                  useApp.getState().reset();
                  setConfirm(false);
                  toast.success("Demo data restored");
                }}
              >
                Yes, reset
              </button>
              <button type="button" className="min-h-11 rounded-xl px-4 text-sm font-semibold" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="mt-3 min-h-11 rounded-xl bg-high-ink px-4 text-sm font-semibold text-primary-fg">
              Reset demo data
            </button>
          )}
        </section>
      </div>
    </Page>
  );
}
