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
  return <WorkspaceContent key={user.id} />;
}

function WorkspaceContent() {
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

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectRequestId, setProjectRequestId] = useState(newRequestId);
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
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
        schedule: null,
        assigneeIds: [],
        requestId: taskRequestId,
      }});
      setTaskTitle(""); setTaskDescription(""); setPriority("medium"); setDueDate("");
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

  async function updateTask(task: DomainTask, patch: Partial<Pick<DomainTask, "status" | "priority">>) {
    if (!workspace || busy) return;
    setBusy("task:" + task.id); setError(null); setNotice(null);
    try {
      const updated = await updateTaskoraTask({ data: {
        workspaceId: workspace.workspaceId, taskId: task.id, expectedVersion: task.version, ...patch,
      }});
      setTasks((current) => current.map((t) => t.id === updated.id ? updated : t));
      setNotice("Task update saved.");
    } catch (cause) {
      setError(messageFor(cause));
      if (cause instanceof Error && /version|changed since/i.test(cause.message)) void refresh(false, false);
    } finally { setBusy(null); }
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
          <p className="mt-1 text-sm text-muted">Server-backed tasks and projects, separate from browser-local demo data.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-sm font-medium hover:bg-chip">Local demo</Link>
          <UserButton />
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
        {error && <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-high bg-high/20 p-3" role="alert"><p className="min-w-0 flex-1 text-sm">{error}</p><button type="button" onClick={() => void refresh()} className="min-h-10 rounded-lg border border-line px-3 text-sm font-semibold">Retry refresh</button></div>}
        {notice && <p className="rounded-xl border border-line bg-surface p-3 text-sm" role="status">{notice}</p>}
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
              {visibleTasks.map((task) => <article key={task.id} className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
                <div className="min-w-0"><h3 className="font-medium">{task.title}</h3><p className="mt-0.5 text-sm text-muted">{projectNames.get(task.projectId) ?? "Unknown project"} · {task.dueDate ?? "No deadline"}</p>{task.description && <p className="mt-2 whitespace-pre-wrap text-sm">{task.description}</p>}</div>
                <label className="grid gap-1 text-xs text-muted">Status<select aria-label={"Status for " + task.title} value={task.status} onChange={(e) => void updateTask(task, { status: e.target.value as TaskStatus })} disabled={busy !== null} className="h-10 rounded-lg border border-line bg-bg px-2 text-sm text-fg">{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
                <label className="grid gap-1 text-xs text-muted">Priority<select aria-label={"Priority for " + task.title} value={task.priority} onChange={(e) => void updateTask(task, { priority: e.target.value as TaskPriority })} disabled={busy !== null} className="h-10 rounded-lg border border-line bg-bg px-2 text-sm text-fg">{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
                <button type="button" onClick={() => void archiveTask(task)} disabled={busy !== null} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium disabled:opacity-50">{busy === "archive:" + task.id ? "Archiving…" : "Archive"}</button>
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
