import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildData } from "@/lib/seed";
import { migratePortfolioState } from "@/lib/portfolio-migration";
import {
  ME,
  type Member,
  type Notice,
  type Priority,
  type Project,
  type Quick,
  type Scope,
  type Settings,
  type SortKey,
  type Status,
  type Task,
  type ViewId,
} from "@/lib/types";
import { kindFromName, formatBytes } from "@/lib/utils";
import { isDateKey, todayKey } from "@/lib/format";
import type { WorkspaceBackupData } from "@/lib/workspace-backup.ts";
import { mergeWorkspaceRecords, type WorkspaceMergeCounts } from "@/lib/workspace-merge.ts";

interface AppState {
  tasks: Task[];
  projects: Project[];
  members: Member[];
  notifications: Notice[];
  settings: Settings;
  view: ViewId;
  scope: Scope;
  quick: Quick;
  sort: SortKey;
  query: string;
  projectId: string | null;
  memberId: string | null;
  calendarDay: string | null;
  selectedId: string | null;
  detailsOpen: boolean;
  composerOpen: boolean;
  composerStatus: Status;
  sidebarOpen: boolean;
  pendingDeleteId: string | null;
  setView: (view: ViewId) => void;
  setScope: (scope: Scope) => void;
  setQuick: (quick: Quick) => void;
  setSort: (sort: SortKey) => void;
  setQuery: (query: string) => void;
  setProjectFilter: (projectId: string | null) => void;
  setMemberFilter: (memberId: string | null) => void;
  setCalendarDay: (day: string | null) => void;
  clearFilters: () => void;
  selectTask: (id: string | null) => void;
  setDetailsOpen: (open: boolean) => void;
  openComposer: (status?: Status) => void;
  closeComposer: () => void;
  setSidebarOpen: (open: boolean) => void;
  askDelete: (id: string | null) => void;
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => void;
  moveTask: (id: string, status: Status) => void;
  addTask: (input: {
    title: string;
    summary: string;
    description: string;
    status: Status;
    priority: Priority;
    projectId: string;
    due: string;
    assigneeIds: string[];
  }) => void;
  deleteTask: (id: string) => void;
  duplicateTask: (id: string) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  removeSubtask: (taskId: string, subId: string) => void;
  addComment: (taskId: string, body: string) => void;
  addAttachment: (taskId: string, file: File) => void;
  removeAttachment: (taskId: string, attachmentId: string) => void;
  addProject: (input: { name: string; description: string }) => void;
  setProjectStatus: (id: string, status: Project["status"]) => void;
  addMember: (input: { name: string; role: string; email: string }) => void;
  renameMe: (name: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  readNotice: (id: string) => void;
  readAll: () => void;
  openNotice: (id: string) => void;
  replaceWorkspaceData: (data: WorkspaceBackupData) => void;
  mergeWorkspaceData: (data: WorkspaceBackupData) => WorkspaceMergeCounts;
  reset: () => void;
}

const fresh = () => buildData();

const toneForPriority = (priority: Priority): Task["tone"] =>
  priority === "high" ? "rose" : priority === "medium" ? "amber" : "blue";

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...fresh(),
      view: "board",
      scope: "all",
      quick: "none",
      sort: "due",
      query: "",
      projectId: null,
      memberId: null,
      calendarDay: null,
      selectedId: fresh().tasks[0]?.id ?? null,
      detailsOpen: false,
      composerOpen: false,
      composerStatus: "todo",
      sidebarOpen: false,
      pendingDeleteId: null,
      setView: (view) => set({ view, sidebarOpen: false }),
      setScope: (scope) => set({ scope, quick: "none" }),
      setQuick: (quick) => set({ quick, scope: "all" }),
      setSort: (sort) => set({ sort }),
      setQuery: (query) => set({ query }),
      setProjectFilter: (projectId) => set({ projectId, view: "board", sidebarOpen: false }),
      setMemberFilter: (memberId) => set({ memberId, view: "board", sidebarOpen: false }),
      setCalendarDay: (calendarDay) => set({ calendarDay, view: "board", sidebarOpen: false }),
      clearFilters: () =>
        set({ scope: "all", quick: "none", query: "", projectId: null, memberId: null, calendarDay: null }),
      selectTask: (id) => set({ selectedId: id, detailsOpen: id !== null }),
      setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
      openComposer: (status = "todo") => set({ composerOpen: true, composerStatus: status, sidebarOpen: false }),
      closeComposer: () => set({ composerOpen: false }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      askDelete: (pendingDeleteId) => set({ pendingDeleteId }),
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      moveTask: (id, status) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)) })),
      addTask: (input) => {
        const title = input.title.trim();
        if (!title) return;
        const state = get();
        const id = crypto.randomUUID();
        const projectId = state.projects.some((project) => project.id === input.projectId)
          ? input.projectId
          : state.projects[0]?.id ?? input.projectId;
        const assigneeIds = [...new Set(input.assigneeIds)].filter((memberId) =>
          state.members.some((member) => member.id === memberId),
        );
        const task: Task = {
          ...input,
          id,
          title,
          projectId,
          due: isDateKey(input.due) ? input.due : todayKey(),
          summary: input.summary.trim() || "No summary yet.",
          description: input.description.trim() || input.summary.trim() || "Add a description so the team knows what done looks like.",
          assigneeIds,
          createdById: ME,
          icon: "clipboard",
          tone: toneForPriority(input.priority),
          subtasks: [],
          comments: [],
          attachments: [],
          createdAt: new Date().toISOString(),
          rank: Date.now(),
        };
        set((s) => ({ tasks: [task, ...s.tasks], selectedId: id, detailsOpen: true, composerOpen: false }));
      },
      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          detailsOpen: s.selectedId === id ? false : s.detailsOpen,
          pendingDeleteId: null,
        })),
      duplicateTask: (id) => {
        const source = get().tasks.find((t) => t.id === id);
        if (!source) return;
        const copy: Task = {
          ...source,
          id: crypto.randomUUID(),
          title: `${source.title} (copy)`,
          createdAt: new Date().toISOString(),
          createdById: ME,
          status: source.status === "done" ? "todo" : source.status,
          rank: Date.now(),
          comments: [],
          subtasks: source.subtasks.map((sub) => ({ ...sub, id: crypto.randomUUID(), done: false })),
          attachments: source.attachments.map((file) => ({ ...file, id: crypto.randomUUID() })),
        };
        set((s) => ({ tasks: [copy, ...s.tasks], selectedId: copy.id, detailsOpen: true }));
      },
      toggleSubtask: (taskId, subId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id !== taskId
              ? t
              : { ...t, subtasks: t.subtasks.map((sub) => (sub.id === subId ? { ...sub, done: !sub.done } : sub)) },
          ),
        })),
      addSubtask: (taskId, title) => {
        const clean = title.trim();
        if (!clean) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id !== taskId
              ? t
              : { ...t, subtasks: [...t.subtasks, { id: crypto.randomUUID(), title: clean, done: false }] },
          ),
        }));
      },
      removeSubtask: (taskId, subId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id !== taskId ? t : { ...t, subtasks: t.subtasks.filter((sub) => sub.id !== subId) },
          ),
        })),
      addComment: (taskId, body) => {
        const clean = body.trim();
        if (!clean) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id !== taskId
              ? t
              : {
                  ...t,
                  comments: [
                    ...t.comments,
                    { id: crypto.randomUUID(), authorId: ME, body: clean, at: new Date().toISOString() },
                  ],
                },
          ),
        }));
      },
      addAttachment: (taskId, file) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id !== taskId
              ? t
              : {
                  ...t,
                  attachments: [
                    ...t.attachments,
                    {
                      id: crypto.randomUUID(),
                      name: file.name,
                      size: formatBytes(file.size),
                      kind: kindFromName(file.name),
                    },
                  ],
                },
          ),
        })),
      removeAttachment: (taskId, attachmentId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id !== taskId ? t : { ...t, attachments: t.attachments.filter((file) => file.id !== attachmentId) },
          ),
        })),
      addProject: ({ name, description }) => {
        const clean = name.trim();
        if (!clean) return;
        const id = `${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 4)}`;
        set((s) => ({
          projects: [...s.projects, { id, name: clean, description: description.trim() || "New shared project.", status: "active" }],
        }));
      },
      setProjectStatus: (id, status) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, status } : p)) })),
      addMember: ({ name, role, email }) => {
        const clean = name.trim();
        if (!clean) return;
        set((s) => ({
          members: [
            ...s.members,
            {
              id: crypto.randomUUID(),
              name: clean,
              role: role.trim() || "Teammate",
              title: role.trim() || "Teammate",
              email: email.trim() || "teammate@example.com",
              tone: s.members.length % 4,
            },
          ],
        }));
      },
      renameMe: (name) => {
        const clean = name.trim();
        if (!clean) return;
        set((s) => ({ members: s.members.map((m) => (m.id === ME ? { ...m, name: clean } : m)) }));
      },
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      readNotice: (id) =>
        set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      readAll: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      openNotice: (id) => {
        const notice = get().notifications.find((n) => n.id === id);
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          ...(notice?.taskId ? { selectedId: notice.taskId, detailsOpen: true, view: "board" as ViewId } : {}),
        }));
      },
      replaceWorkspaceData: (data) =>
        set({
          tasks: data.tasks,
          projects: data.projects,
          members: data.members,
          notifications: data.notifications,
          settings: data.settings,
          selectedId: data.tasks[0]?.id ?? null,
          detailsOpen: false,
          composerOpen: false,
          pendingDeleteId: null,
          scope: "all",
          quick: "none",
          query: "",
          sort: "due",
          projectId: null,
          memberId: null,
          calendarDay: null,
          view: "board",
          sidebarOpen: false,
          composerStatus: "todo",
        }),
      mergeWorkspaceData: (data) => {
        const state = get();
        const merged = mergeWorkspaceRecords({
          tasks: state.tasks,
          projects: state.projects,
          members: state.members,
          notifications: state.notifications,
          settings: state.settings,
        }, data);
        set({
          tasks: merged.data.tasks,
          projects: merged.data.projects,
          members: merged.data.members,
          notifications: merged.data.notifications,
          selectedId: state.selectedId ?? merged.data.tasks[0]?.id ?? null,
        });
        return merged.counts;
      },
      reset: () =>
        set({
          ...fresh(),
          view: "board",
          scope: "all",
          quick: "none",
          sort: "due",
          query: "",
          projectId: null,
          memberId: null,
          calendarDay: null,
          selectedId: fresh().tasks[0]?.id ?? null,
          detailsOpen: false,
          composerOpen: false,
          composerStatus: "todo",
          sidebarOpen: false,
          pendingDeleteId: null,
        }),
    }),
    {
      name: "taskflow-pro-v1",
      version: 2,
      migrate: (persistedState) => migratePortfolioState(persistedState, fresh()) as Partial<AppState>,
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        tasks: s.tasks,
        projects: s.projects,
        members: s.members,
        notifications: s.notifications,
        settings: s.settings,
      }),
    },
  ),
);
