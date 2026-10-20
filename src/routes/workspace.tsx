import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  archiveTaskoraTask,
  createOrGetTaskoraPersonalWorkspace,
  createTaskoraProject,
  createTaskoraTask,
  listTaskoraProjects,
  listTaskoraTasks,
  updateTaskoraTask,
} from "@/lib/domain-data";
import { UserButton } from "@/lib/auth/gates";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { browserTimeZone, buildScheduleInterval, formatScheduledInstant } from "@/lib/schedule-input";
import { PORTFOLIO_PROJECTS, PORTFOLIO_TASKS, describePortfolioProject, describePortfolioTask } from "@/lib/portfolio-seed";

export const Route = createFileRoute("/workspace")({ component: WorkspacePage });

const PAGE_SIZE = 50;
type PersonalWorkspace = Awaited<ReturnType<typeof createOrGetTaskoraPersonalWorkspace>>;
type DomainProject = Awaited<ReturnType<typeof listTaskoraProjects>>[number];
type TaskPage = Awaited<ReturnType<typeof listTaskoraTasks>>;
type DomainTask = TaskPage["items"][number];
type TaskStatus = DomainTask["status"];
type TaskPriority = DomainTask["priority"];

const STATUSES: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "To do" },
  { value: "progress", label: "In progress" },
  { value: "done", label: "Done" },
];
const PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const newRequestId = () => globalThis.crypto.randomUUID();

function toDateTimeLocalInZone(value: string, timeZone: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return "";
  try {
    const fields: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant)) {
      if (["year", "month", "day", "hour", "minute"].includes(part.type)) fields[part.type] = part.value;
    }
    if (!["year", "month", "day", "hour", "minute"].every((field) => fields[field])) return "";
    return fields.year + "-" + fields.month + "-" + fields.day + "T" + fields.hour + ":" + fields.minute;
  } catch {
    return "";
  }
}

const messageFor = (error: unknown) =>
  error instanceof Error && error.message.trim()
    ? error.message
    : "The server request failed. Your previous data remains available; retry or refresh.";

function WorkspacePage() {
  const { user, isPending } = useCurrentUserState();

  if (!authEnabled) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6 text-fg">
        <section className="w-full max-w-lg space-y-3 rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-xl font-bold">Cloud workspace is disabled</h1>
          <p className="text-sm text-muted">Enable authenticated sign-in and connect durable PostgreSQL before using the server-backed workspace.</p>
          <Link to="/" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">Return to local board</Link>
        </section>
      </main>
    );
  }
  if (isPending) {
    return <main className="grid min-h-screen place-items-center p-6"><p role="status" className="text-sm text-muted">Checking your account…</p></main>;
  }
  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6 text-fg">
        <section className="w-full max-w-lg space-y-3 rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-xl font-bold">Sign in to open your workspace</h1>
          <p className="text-sm text-muted">Your tasks and projects are scoped to your verified account.</p>
          <Link to="/login" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">Sign in</Link>
        </section>
      </main>
    );
  }
  return <WorkspaceContent key={user.id} actorUserId={user.id} />;
}

function WorkspaceContent({ actorUserId }: { actorUserId: string }) {
  const [workspace, setWorkspace] = useState<PersonalWorkspace | null>(null);
  const [projects, setProjects] = useState<DomainProject[]>([]);
  const [tasks, setTasks] = useState<DomainTask[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [search, setSearch] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTimeZone, setEditTimeZone] = useState(browserTimeZone);
  const [editAssignment, setEditAssignment] = useState<"unchanged" | "self" | "unassigned">("unchanged");
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    dueDate: "",
    scheduleStart: "",
    scheduleEnd: "",
  });

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectRequestId, setProjectRequestId] = useState(newRequestId);
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [scheduleTimeZone] = useState(browserTimeZone);
  const [taskRequestId, setTaskRequestId] = useState(newRequestId);

  const refresh = useCallback(async (showLoading = true, clearMessages = true): Promise<boolean> => {
    if (showLoading) setLoading(true);
    if (clearMessages) { setError(null); setNotice(null); }
    try {
      const personal = await createOrGetTaskoraPersonalWorkspace({ data: {} });
      const [nextProjects, page] = await Promise.all([
        listTaskoraProjects({ data: { workspaceId: personal.workspaceId } }),
        listTaskoraTasks({ data: { workspaceId: personal.workspaceId, limit: PAGE_SIZE } }),
      ]);
      setWorkspace(personal);
      setProjects(nextProjects);
      setTasks(page.items);
      setCursor(page.nextCursor);
      setNeedsRefresh(false);
      setTaskProjectId((current) => current && nextProjects.some((p) => p.id === current) ? current : nextProjects[0]?.id ?? "");
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleTasks = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return q ? tasks.filter((t) => t.title.toLocaleLowerCase().includes(q) || t.description.toLocaleLowerCase().includes(q)) : tasks;
  }, [tasks, search]);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !projectName.trim() || busy) return;
    setBusy("project");
    setError(null); setNotice(null);
    try {
      const project = await createTaskoraProject({ data: {
        workspaceId: workspace.workspaceId,
        name: projectName.trim(),
        description: projectDescription,
        requestId: projectRequestId,
      }});
      setProjects((current) => [project, ...current.filter((p) => p.id !== project.id)]);
      setTaskProjectId(project.id);
      setProjectName(""); setProjectDescription("");
      setProjectRequestId(newRequestId());
      setNotice("Project saved to your authenticated workspace.");
    } catch (cause) {
      // Preserve form and idempotency key: retrying an identical request is safe.
      setError(messageFor(cause));
    } finally {
      setBusy(null);
    }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !taskProjectId || !taskTitle.trim() || busy) return;
    const scheduleResult = buildScheduleInterval(scheduleStart, scheduleEnd, scheduleTimeZone);
    if (!scheduleResult.ok) { setError(scheduleResult.message); setNotice(null); return; }
    setBusy("create-task"); setError(null); setNotice(null);
    try {
      const task = await createTaskoraTask({ data: {
        workspaceId: workspace.workspaceId,
        projectId: taskProjectId,
        title: taskTitle.trim(),
        description: taskDescription,
        status: "todo",
        priority,
        dueDate: dueDate || null,
        schedule: scheduleResult.schedule,
        assigneeIds: [],
        requestId: taskRequestId,
      }});
      setTaskTitle(""); setTaskDescription(""); setPriority("medium"); setDueDate("");
      setScheduleStart(""); setScheduleEnd("");
      setTaskRequestId(newRequestId());
      if (!await refresh(false, false)) {
        setTasks((current) => [task, ...current.filter((t) => t.id !== task.id)].slice(0, PAGE_SIZE));
        setCursor(null); setNeedsRefresh(true);
        setNotice("Task saved; list refresh failed. Refresh before loading more results.");
      } else {
        setNotice("Task saved to your authenticated workspace.");
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(null);
    }
  }

  async function populatePortfolio() {
    if (!workspace || busy) return;
    setBusy("populate-portfolio");
    setError(null);
    setNotice(null);
    const projectIds = new Map<string, string>();
    const projectsCreated: DomainProject[] = [];

    try {
      // Stable request IDs make each record safe to replay after an interrupted
      // request. This is additive: seed reruns do not overwrite task edits.
      let projectIndex = 0;
      for (const seed of PORTFOLIO_PROJECTS) {
        projectIndex += 1;
        setNotice("Creating project " + projectIndex + " of " + PORTFOLIO_PROJECTS.length + ": " + seed.name);
        const created = await createTaskoraProject({ data: {
          workspaceId: workspace.workspaceId,
          name: seed.name,
          description: describePortfolioProject(seed),
          requestId: seed.requestId,
        } });
        projectIds.set(seed.id, created.id);
        projectsCreated.push(created);
      }

      setProjects((current) => {
        const byId = new Map(current.map((project) => [project.id, project]));
        for (const project of projectsCreated) byId.set(project.id, project);
        return [...byId.values()];
      });
      setTaskProjectId(projectIds.get("taskora") ?? projectsCreated[0]?.id ?? "");

      let taskIndex = 0;
      for (const seed of PORTFOLIO_TASKS) {
        taskIndex += 1;
        setNotice("Creating task " + taskIndex + " of " + PORTFOLIO_TASKS.length + ": " + seed.title);
        const projectId = projectIds.get(seed.projectId);
        if (!projectId) throw new Error("Portfolio task references an unknown project: " + seed.projectId);
        await createTaskoraTask({ data: {
          workspaceId: workspace.workspaceId,
          projectId,
          title: seed.title,
          description: describePortfolioTask(seed),
          status: seed.status,
          priority: seed.priority,
          dueDate: null,
          schedule: null,
          assigneeIds: [actorUserId],
          requestId: seed.requestId,
        } });
      }

      const refreshed = await refresh(false, false);
      if (refreshed) {
        setNotice("Portfolio populated: " + PORTFOLIO_PROJECTS.length + " projects and " + PORTFOLIO_TASKS.length + " source-linked tasks are available. Repeating this action is safe; existing edits are not overwritten.");
      } else {
        setNeedsRefresh(true);
        setNotice("Portfolio create requests completed, but the list could not be refreshed. Refresh to verify saved records; repeating the same request is safe.");
      }
    } catch (cause) {
      setError("Portfolio population stopped safely. Successfully created records remain saved; retry uses stable request keys and will not duplicate confirmed records. " + messageFor(cause));
    } finally {
      setBusy(null);
    }
  }

  function beginEditTask(task: DomainTask) {
    setEditingTaskId(task.id);
    const timeZone = task.schedule?.timeZone ?? browserTimeZone();
    setEditTimeZone(timeZone);
    setEditAssignment("unchanged");
    setEditDraft({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ?? "",
      scheduleStart: task.schedule ? toDateTimeLocalInZone(task.schedule.startsAt, timeZone) : "",
      scheduleEnd: task.schedule ? toDateTimeLocalInZone(task.schedule.endsAt, timeZone) : "",
    });
    setError(null);
    setNotice(null);
  }

  async function updateTask(
    task: DomainTask,
    patch: Partial<Pick<DomainTask, "title" | "description" | "status" | "priority" | "dueDate" | "schedule" | "assigneeIds">>,
  ): Promise<boolean> {
    if (!workspace || busy) return false;
    setBusy("task:" + task.id); setError(null); setNotice(null);
    try {
      const updated = await updateTaskoraTask({ data: {
        workspaceId: workspace.workspaceId, taskId: task.id, expectedVersion: task.version, ...patch,
      }});
      setTasks((current) => current.map((t) => t.id === updated.id ? updated : t));
      setNotice("Task update saved.");
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      if (cause instanceof Error && /version|changed since/i.test(cause.message)) void refresh(false, false);
      return false;
    } finally { setBusy(null); }
  }

  async function saveTaskDetails(task: DomainTask) {
    if (!editDraft.title.trim()) {
      setError("Task title cannot be empty.");
      return;
    }
    const scheduleResult = buildScheduleInterval(editDraft.scheduleStart, editDraft.scheduleEnd, editTimeZone);
    if (!scheduleResult.ok) {
      setError(scheduleResult.message);
      setNotice(null);
      return;
    }
    const patch: Partial<Pick<DomainTask, "title" | "description" | "dueDate" | "schedule" | "assigneeIds">> = {
      title: editDraft.title.trim(),
      description: editDraft.description,
      dueDate: editDraft.dueDate || null,
      schedule: scheduleResult.schedule,
    };
    if (editAssignment === "self") patch.assigneeIds = [actorUserId];
    if (editAssignment === "unassigned") patch.assigneeIds = [];
    if (await updateTask(task, patch)) {
      setEditingTaskId(null);
      setEditAssignment("unchanged");
    }
  }

  async function archiveTask(task: DomainTask) {
    if (!workspace || busy) return;
    setBusy("archive:" + task.id); setError(null); setNotice(null);
    try {
      await archiveTaskoraTask({ data: { workspaceId: workspace.workspaceId, taskId: task.id, expectedVersion: task.version } });
      setTasks((current) => current.filter((t) => t.id !== task.id));
      setCursor(null); setNeedsRefresh(true);
      setNotice("Task archived. Refresh the list before loading additional pages.");
    } catch (cause) {
      setError(messageFor(cause));
      if (cause instanceof Error && /version|changed since/i.test(cause.message)) void refresh(false, false);
    } finally { setBusy(null); }
  }

  async function loadMore() {
    if (!workspace || !cursor || busy || needsRefresh) return;
    setBusy("load-more"); setError(null);
    try {
      const page = await listTaskoraTasks({ data: { workspaceId: workspace.workspaceId, limit: PAGE_SIZE, cursor } });
      setTasks((current) => {
        const byId = new Map(current.map((t) => [t.id, t]));
        for (const t of page.items) byId.set(t.id, t);
        return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(messageFor(cause));
    } finally { setBusy(null); }
  }

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Taskora · Cloud workspace</h1>
          <p className="mt-1 text-sm text-muted">Server-backed tasks and projects, separate from the browser-local personal board. Records do not automatically sync across deployments.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-sm font-medium hover:bg-chip">Personal board</Link>
          <UserButton />
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
        {error && <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-high bg-high/20 p-3" role="alert"><p className="min-w-0 flex-1 text-sm">{error}</p><button type="button" onClick={() => void refresh()} className="min-h-10 rounded-lg border border-line px-3 text-sm font-semibold">Retry refresh</button></div>}
        {notice && <p className="rounded-xl border border-line bg-surface p-3 text-sm" role="status">{notice}</p>}
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold">Populate your real portfolio</h2>
            <p className="mt-1 text-sm text-muted">Populate the actual project portfolio and acceptance tasks from the canonical shared dataset. No fictitious collaborators, deadlines or sample catalog items are seeded; retries are idempotent.</p>
          </div>
          <button type="button" onClick={() => void populatePortfolio()} disabled={!workspace || loading || busy !== null} className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-50">
            {busy === "populate-portfolio" ? "Saving portfolio…" : "Populate real portfolio"}
          </button>
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={submitProject} className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Projects</h2>
            <label className="grid gap-1 text-sm">Project name<input required maxLength={500} value={projectName} onChange={(e) => { setProjectName(e.target.value); setProjectRequestId(newRequestId()); }} className="h-11 rounded-xl border border-line bg-bg px-3" disabled={busy !== null} /></label>
            <label className="grid gap-1 text-sm">Description<textarea maxLength={100000} value={projectDescription} onChange={(e) => { setProjectDescription(e.target.value); setProjectRequestId(newRequestId()); }} rows={2} className="rounded-xl border border-line bg-bg p-3" disabled={busy !== null} /></label>
            <button type="submit" disabled={!projectName.trim() || busy !== null} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50">{busy === "project" ? "Saving project…" : "Create project"}</button>
            <ul className="divide-y divide-line" aria-label="Your projects">{projects.map((p) => <li key={p.id} className="py-2"><p className="font-medium">{p.name}</p>{p.description && <p className="text-sm text-muted">{p.description}</p>}</li>)}{!loading && projects.length === 0 && <li className="py-2 text-sm text-muted">No projects yet. Create one to add tasks.</li>}</ul>
          </form>
          <form onSubmit={submitTask} className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold">New task</h2>
            <p className="text-sm text-muted">Create requests are safe to retry with the same input.</p>
            <label className="grid gap-1 text-sm">Project<select required value={taskProjectId} onChange={(e) => { setTaskProjectId(e.target.value); setTaskRequestId(newRequestId()); }} className="h-11 rounded-xl border border-line bg-bg px-3" disabled={busy !== null || projects.length === 0}><option value="">Choose a project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Title<input required maxLength={500} value={taskTitle} onChange={(e) => { setTaskTitle(e.target.value); setTaskRequestId(newRequestId()); }} className="h-11 rounded-xl border border-line bg-bg px-3" disabled={busy !== null} /></label>
            <label className="grid gap-1 text-sm">Description<textarea maxLength={100000} value={taskDescription} onChange={(e) => { setTaskDescription(e.target.value); setTaskRequestId(newRequestId()); }} rows={3} className="rounded-xl border border-line bg-bg p-3" disabled={busy !== null} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Priority<select value={priority} onChange={(e) => { setPriority(e.target.value as TaskPriority); setTaskRequestId(newRequestId()); }} className="h-11 rounded-xl border border-line bg-bg px-3" disabled={busy !== null}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
              <label className="grid gap-1 text-sm">Due date<input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setTaskRequestId(newRequestId()); }} className="h-11 rounded-xl border border-line bg-bg px-3" disabled={busy !== null} /></label>
            </div>
            <div className="grid gap-3 rounded-xl border border-line p-3">
              <div>
                <p className="text-sm font-medium">Schedule (optional)</p>
                <p className="mt-1 text-xs text-muted">Times use your browser timezone: {scheduleTimeZone}. Leave both empty when the task has no fixed time.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">Start date and time<input type="datetime-local" value={scheduleStart} onChange={(e) => { setScheduleStart(e.target.value); setTaskRequestId(newRequestId()); }} className="h-11 min-w-0 rounded-xl border border-line bg-bg px-3" disabled={busy !== null} /></label>
                <label className="grid gap-1 text-sm">End date and time<input type="datetime-local" value={scheduleEnd} onChange={(e) => { setScheduleEnd(e.target.value); setTaskRequestId(newRequestId()); }} className="h-11 min-w-0 rounded-xl border border-line bg-bg px-3" disabled={busy !== null} /></label>
              </div>
            </div>
            <button type="submit" disabled={!taskTitle.trim() || !taskProjectId || busy !== null} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50">{busy === "create-task" ? "Saving task…" : "Create task"}</button>
          </form>
        </section>
        <section className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold">Tasks</h2><p className="mt-1 text-sm text-muted">{workspace ? workspace.name : "Loading your workspace…"} · current page: {tasks.length}</p></div>
            <div className="flex flex-wrap gap-2"><input aria-label="Search server tasks" placeholder="Search this page…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 min-w-40 rounded-xl border border-line bg-bg px-3 text-sm" /><button type="button" onClick={() => void refresh()} disabled={busy !== null} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">Refresh</button></div>
          </div>
          {loading && !workspace ? <p className="py-5 text-sm text-muted" role="status">Loading your server workspace…</p> : (
            <div className="grid gap-2">
              {visibleTasks.map((task) => <article key={task.id} className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-center">
                <div className="min-w-0">
                  <h3 className="font-medium">{task.title}</h3>
                  <p className="mt-0.5 text-sm text-muted">{projectNames.get(task.projectId) ?? "Unknown project"} · {task.dueDate ?? "No deadline"} · {task.assigneeIds.length ? (task.assigneeIds.includes(actorUserId) ? "Assigned to you" : task.assigneeIds.length + " assignee(s)") : "Unassigned"}</p>
                  {task.description && <p className="mt-2 whitespace-pre-wrap text-sm">{task.description}</p>}
                  {task.schedule && <p className="mt-2 text-sm text-muted">Scheduled: {formatScheduledInstant(task.schedule.startsAt, task.schedule.timeZone)} – {formatScheduledInstant(task.schedule.endsAt, task.schedule.timeZone)} ({task.schedule.timeZone})</p>}
                </div>
                <label className="grid gap-1 text-xs text-muted">Status<select aria-label={"Status for " + task.title} value={task.status} onChange={(e) => void updateTask(task, { status: e.target.value as TaskStatus })} disabled={busy !== null} className="h-10 rounded-lg border border-line bg-bg px-2 text-sm text-fg">{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
                <label className="grid gap-1 text-xs text-muted">Priority<select aria-label={"Priority for " + task.title} value={task.priority} onChange={(e) => void updateTask(task, { priority: e.target.value as TaskPriority })} disabled={busy !== null} className="h-10 rounded-lg border border-line bg-bg px-2 text-sm text-fg">{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
                <button type="button" onClick={() => editingTaskId === task.id ? setEditingTaskId(null) : beginEditTask(task)} disabled={busy !== null} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium disabled:opacity-50">{editingTaskId === task.id ? "Close editor" : "Edit details"}</button>
                <button type="button" onClick={() => void archiveTask(task)} disabled={busy !== null} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium disabled:opacity-50">{busy === "archive:" + task.id ? "Archiving…" : "Archive"}</button>
                {editingTaskId === task.id && <form onSubmit={(event) => { event.preventDefault(); void saveTaskDetails(task); }} className="grid gap-3 rounded-xl border border-line bg-bg/40 p-3 md:col-span-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">Task title<input required maxLength={500} value={editDraft.title} onChange={(e) => setEditDraft((current) => ({ ...current, title: e.target.value }))} disabled={busy !== null} className="h-11 rounded-lg border border-line bg-bg px-3" /></label>
                    <label className="grid gap-1 text-sm">Due date<input type="date" value={editDraft.dueDate} onChange={(e) => setEditDraft((current) => ({ ...current, dueDate: e.target.value }))} disabled={busy !== null} className="h-11 rounded-lg border border-line bg-bg px-3" /></label>
                  </div>
                  <label className="grid gap-1 text-sm">Description<textarea maxLength={100000} rows={3} value={editDraft.description} onChange={(e) => setEditDraft((current) => ({ ...current, description: e.target.value }))} disabled={busy !== null} className="rounded-lg border border-line bg-bg p-3" /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">Assignment<select value={editAssignment} onChange={(e) => setEditAssignment(e.target.value as typeof editAssignment)} disabled={busy !== null} className="h-11 rounded-lg border border-line bg-bg px-3"><option value="unchanged">Keep current assignment</option><option value="self">Assign to me</option><option value="unassigned">Unassigned</option></select></label>
                    <div className="grid gap-1 text-sm"><span>Schedule timezone</span><div className="flex min-h-11 items-center rounded-lg border border-line px-3 text-sm">{editTimeZone}</div></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">Start date and time<input type="datetime-local" value={editDraft.scheduleStart} onChange={(e) => setEditDraft((current) => ({ ...current, scheduleStart: e.target.value }))} disabled={busy !== null} className="h-11 min-w-0 rounded-lg border border-line bg-bg px-3" /></label>
                    <label className="grid gap-1 text-sm">End date and time<input type="datetime-local" value={editDraft.scheduleEnd} onChange={(e) => setEditDraft((current) => ({ ...current, scheduleEnd: e.target.value }))} disabled={busy !== null} className="h-11 min-w-0 rounded-lg border border-line bg-bg px-3" /></label>
                  </div>
                  <p className="text-xs text-muted">Leave both schedule fields empty to remove a schedule. Ambiguous or nonexistent local times are rejected. Existing assignee changes are preserved unless you explicitly choose an option.</p>
                  <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setEditingTaskId(null)} disabled={busy !== null} className="min-h-10 rounded-lg border border-line px-3 text-sm">Cancel</button><button type="submit" disabled={busy !== null || !editDraft.title.trim()} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50">{busy === "task:" + task.id ? "Saving…" : "Save details"}</button></div>
                </form>}
              </article>)}
              {!loading && visibleTasks.length === 0 && <p className="py-5 text-sm text-muted">{search.trim() ? "No tasks match the current-page search." : "No tasks yet. Create your first task above."}</p>}
            </div>
          )}
          {needsRefresh && <p className="text-sm text-muted" role="status">The list may be stale. Refresh before loading more results.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">Versioned writes reject stale edits. Page size: {PAGE_SIZE}.</p>{cursor && <button type="button" onClick={() => void loadMore()} disabled={busy !== null || needsRefresh} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">{busy === "load-more" ? "Loading more…" : "Load more"}</button>}</div>
        </section>
      </div>
    </main>
  );
}
