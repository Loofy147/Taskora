import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "sonner";
import { Board } from "@/components/board";
import { Composer, DeleteDialog } from "@/components/composer";
import { DetailsPanel } from "@/components/details";
import { Shell } from "@/components/shell";
import { CalendarView, FilesView, ListView, ProjectsView, SettingsView, TeamView } from "@/components/views";
import { useApp } from "@/lib/store";
import { resumeWorkspaceSyncIfEnabled } from "@/lib/workspace-sync";

const ReportsView = lazy(() => import("@/components/reports-view").then((module) => ({ default: module.ReportsView })));

export function App() {
  const view = useApp((s) => s.view);
  useBoot();

  return (
    <>
      <Shell>
        <div className="flex min-w-0 flex-1">
          <main className="min-w-0 flex-1 overflow-hidden pb-16 lg:pb-0">
            {view === "board" && <Board />}
            {view === "list" && <ListView />}
            {view === "projects" && <ProjectsView />}
            {view === "team" && <TeamView />}
            {view === "calendar" && <CalendarView />}
            {view === "files" && <FilesView />}
            {view === "reports" && (
              <Suspense fallback={<div className="px-4 py-5 text-sm text-muted" role="status">Loading reports…</div>}>
                <ReportsView />
              </Suspense>
            )}
            {view === "settings" && <SettingsView />}
          </main>
          <DetailsPanel />
        </div>
      </Shell>
      <Composer />
      <DeleteDialog />
      <Toaster position="top-center" />
    </>
  );
}

function useBoot() {
  useEffect(() => {
    const openIfWide = () => {
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const state = useApp.getState();
      if (state.selectedId && state.tasks.some((task) => task.id === state.selectedId)) {
        useApp.setState({ detailsOpen: true });
      }
    };
    const unsub = useApp.persist.onFinishHydration(() => {
      const state = useApp.getState();
      if (state.selectedId && !state.tasks.some((task) => task.id === state.selectedId)) {
        useApp.setState({ selectedId: state.tasks[0]?.id ?? null, detailsOpen: false });
      }
      openIfWide();
      // Only resumes after Zustand restored the user's explicit sync opt-in.
      // Sync failures must not prevent the app's local state from rendering.
      void resumeWorkspaceSyncIfEnabled();
    });
    void useApp.persist.rehydrate();
    return unsub;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (event.key === "Escape") {
        const state = useApp.getState();
        if (state.composerOpen) state.closeComposer();
        else if (state.pendingDeleteId) state.askDelete(null);
        else if (state.detailsOpen) state.setDetailsOpen(false);
        else if (state.sidebarOpen) state.setSidebarOpen(false);
        return;
      }
      if (typing) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        useApp.getState().openComposer();
      }
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("task-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
