import { useMemo, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, ChevronDown, Menu, Search, Settings, Users, X } from "lucide-react";
import { formatStamp, isOverdue, todayKey } from "@/lib/format";
import { scopeCount } from "@/lib/filters";
import { ME, type Quick, type SortKey } from "@/lib/types";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Avatar, Logo, NAV, QUICKS } from "@/components/bits";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "due", label: "Due Date" },
  { id: "priority", label: "Priority" },
  { id: "title", label: "Name" },
  { id: "created", label: "Recently added" },
];

export function Shell({ children }: { children: ReactNode }) {
  const density = useApp((s) => s.settings.density);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  return (
    <div data-density={density} className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <NavBody />
        </aside>
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
      <MobileNav />
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-fg/30" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Logo />
              <button type="button" className="grid size-11 place-items-center rounded-xl text-muted" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <NavBody />
          </aside>
        </div>
      )}
    </div>
  );
}

function NavBody() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const tasks = useApp((s) => s.tasks);
  const quick = useApp((s) => s.quick);
  const setQuick = useApp((s) => s.setQuick);
  const today = todayKey();
  const counts = useMemo(
    () => ({
      mine: tasks.filter((t) => t.assigneeIds.includes(ME) || t.createdById === ME).length,
      assigned: tasks.filter((t) => t.assigneeIds.includes(ME)).length,
      today: tasks.filter((t) => t.due === today && t.status !== "done").length,
      overdue: tasks.filter((t) => isOverdue(t.due, t.status)).length,
      high: tasks.filter((t) => t.priority === "high" && t.status !== "done").length,
    }),
    [tasks, today],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="flex flex-col gap-0.5 px-3 pt-3" aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                active ? "bg-primary-soft text-primary-ink" : "text-muted hover:bg-chip hover:text-fg",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mx-4 my-3 border-t border-line" />
      <p className="px-4 pb-1 text-xs font-semibold tracking-wide text-faint">Quick Filters</p>
      <div className="flex flex-col gap-0.5 px-3">
        {QUICKS.map((item) => {
          const Icon = item.icon;
          const active = quick === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setQuick(active ? "none" : item.id)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm",
                active ? "bg-primary-soft font-semibold text-primary-ink" : "text-muted hover:bg-chip hover:text-fg",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 text-left">{item.label}</span>
              <span className={cn("text-xs font-bold", item.countClass)}>{counts[item.id]}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-auto p-3">
        <div className="rounded-2xl bg-primary-soft p-4">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-fg">
            <Users className="size-4" />
          </span>
          <p className="mt-3 text-sm font-semibold">Better together</p>
          <p className="text-xs text-muted">Shared tasks. Real progress.</p>
        </div>
      </div>
    </div>
  );
}

function Topbar() {
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const setView = useApp((s) => s.setView);
  const members = useApp((s) => s.members);
  const me = members.find((m) => m.id === ME);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header className="relative z-20 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5 lg:gap-4 lg:px-4">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-xl text-muted hover:bg-chip lg:hidden"
          aria-label="Open menu"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="size-5" />
        </button>
        <Logo />
        <div className="mx-auto hidden min-w-0 max-w-xl flex-1 md:block">
          <SearchField />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-muted hover:bg-chip md:hidden"
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search className="size-5" />
          </button>
          <div className="relative">
            <BellButton
              open={notifOpen}
              onToggle={() => {
                setNotifOpen((v) => !v);
                setProfileOpen(false);
              }}
            />
            {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-muted hover:bg-chip"
            aria-label="Settings"
            onClick={() => setView("settings")}
          >
            <Settings className="size-5" />
          </button>
          <div className="relative">
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 hover:bg-chip"
              aria-expanded={profileOpen}
              aria-label="Account menu"
              onClick={() => {
                setProfileOpen((v) => !v);
                setNotifOpen(false);
              }}
            >
              <Avatar member={me} size="md" />
              <span className="hidden text-left lg:block">
                <span className="block text-sm font-semibold leading-tight">{me?.name || "You"}</span>
                <span className="block text-xs text-faint">{me?.role}</span>
              </span>
              <ChevronDown className="hidden size-4 text-faint lg:block" />
            </button>
            {profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}
          </div>
        </div>
      </div>
      {searchOpen && (
        <div className="px-3 pb-3 md:hidden">
          <SearchField autoFocus />
        </div>
      )}
    </header>
  );
}

function SearchField({ autoFocus = false }: { autoFocus?: boolean }) {
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const members = useApp((s) => s.members);
  const selectTask = useApp((s) => s.selectTask);
  const setView = useApp((s) => s.setView);
  const setProjectFilter = useApp((s) => s.setProjectFilter);
  const setMemberFilter = useApp((s) => s.setMemberFilter);
  const [focused, setFocused] = useState(false);
  const q = query.trim().toLowerCase();
  const taskHits = q ? tasks.filter((t) => t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)).slice(0, 5) : [];
  const projectHits = q ? projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 3) : [];
  const peopleHits = q ? members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 3) : [];
  const show = focused && q.length > 0;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input
        id="task-search"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search tasks, projects, people..."
        className="h-11 w-full rounded-full border border-line bg-chip pr-10 pl-10 text-sm outline-none placeholder:text-faint focus:border-primary focus:bg-surface"
      />
      {query && (
        <button type="button" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-faint hover:text-fg" aria-label="Clear search" onClick={() => setQuery("")}>
          <X className="size-4" />
        </button>
      )}
      {show && (
        <div className="absolute top-full z-30 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          {taskHits.length === 0 && projectHits.length === 0 && peopleHits.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">No matches.</p>
          )}
          {taskHits.length > 0 && <p className="px-4 pt-3 text-xs font-semibold text-faint">Tasks</p>}
          {taskHits.map((task) => (
            <button
              key={task.id}
              type="button"
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                selectTask(task.id);
                setView("board");
              }}
            >
              <span className="font-medium">{task.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{task.summary}</span>
            </button>
          ))}
          {projectHits.map((project) => (
            <button
              key={project.id}
              type="button"
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setProjectFilter(project.id)}
            >
              <span className="font-medium">{project.name}</span>
              <span className="mt-0.5 block text-xs text-muted">Project</span>
            </button>
          ))}
          {peopleHits.map((person) => (
            <button
              key={person.id}
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMemberFilter(person.id)}
            >
              <Avatar member={person} />
              <span>
                <span className="block font-medium">{person.name}</span>
                <span className="block text-xs text-muted">{person.role}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BellButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const unread = useApp((s) => s.notifications.filter((n) => !n.read).length);
  return (
    <button
      type="button"
      className="relative grid size-11 place-items-center rounded-xl text-muted hover:bg-chip"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-high-ink text-xs font-bold text-primary-fg">
          {unread}
        </span>
      )}
    </button>
  );
}

function NotifPanel({ onClose }: { onClose: () => void }) {
  const notifications = useApp((s) => s.notifications);
  const readAll = useApp((s) => s.readAll);
  const openNotice = useApp((s) => s.openNotice);
  return (
    <>
      <button className="fixed inset-0 z-30 cursor-default" aria-label="Close notifications" onClick={onClose} />
      <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <button type="button" className="text-xs font-semibold text-primary" onClick={readAll}>
            Mark all read
          </button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {notifications
            .slice()
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  className="flex w-full gap-3 px-4 py-3 text-left hover:bg-chip"
                  onClick={() => {
                    openNotice(notice.id);
                    onClose();
                  }}
                >
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", notice.read ? "bg-line" : "bg-primary")} />
                  <span>
                    <span className="block text-sm font-semibold">{notice.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{notice.body}</span>
                    <span className="mt-1 block text-xs text-faint">{formatStamp(notice.at)}</span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}

function ProfileMenu({ onClose }: { onClose: () => void }) {
  const setView = useApp((s) => s.setView);
  const reset = useApp((s) => s.reset);
  const me = useApp((s) => s.members.find((m) => m.id === ME));
  return (
    <>
      <button className="fixed inset-0 z-30 cursor-default" aria-label="Close account menu" onClick={onClose} />
      <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-pop">
        <div className="px-3 py-2">
          <p className="text-sm font-semibold">{me?.name}</p>
          <p className="text-xs text-faint">{me?.email}</p>
        </div>
        <button
          type="button"
          className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm hover:bg-chip"
          onClick={() => {
            setView("settings");
            onClose();
          }}
        >
          Profile & settings
        </button>
        <button
          type="button"
          className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-high-ink hover:bg-high"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Reset demo data
        </button>
      </div>
    </>
  );
}

export function MobileNav() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const items = NAV.filter((item) => ["board", "list", "projects", "calendar", "settings"].includes(item.id));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface lg:hidden" aria-label="Mobile">
      {items.map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={cn("flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs", active ? "text-primary" : "text-faint")}
          >
            <Icon className="size-5" />
            {item.label === "Dashboard" ? "Home" : item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function SortMenu() {
  const sort = useApp((s) => s.sort);
  const setSort = useApp((s) => s.setSort);
  const label = SORTS.find((item) => item.id === sort)?.label ?? "Due Date";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg">
        Sort: {label}
        <ChevronDown className="size-4 text-faint" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-pop">
          {SORTS.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              onSelect={() => setSort(item.id)}
              className={cn(
                "cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-chip",
                sort === item.id && "font-semibold text-primary",
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function useFilterState() {
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
  return { tasks, projects, members, scope, quick, query, projectId, memberId, calendarDay, sort };
}

export function scopeBadge(tasks: ReturnType<typeof useApp.getState>["tasks"], scope: Parameters<typeof scopeCount>[1]) {
  return scopeCount(tasks, scope);
}

export type { Quick };
