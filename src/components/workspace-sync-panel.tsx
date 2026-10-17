import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { inspectWorkspaceSnapshot } from "@/lib/workspace-data";
import {
  enableWorkspaceSync,
  getWorkspaceSyncStatus,
  subscribeWorkspaceSyncStatus,
  type WorkspaceSyncStatus,
} from "@/lib/workspace-sync";
import type { WorkspaceStorageStatus } from "@/lib/workspace-storage.server";
import { cn } from "@/lib/utils";

type Choice = "upload" | "download";

export function WorkspaceSyncPanel() {
  const [status, setStatus] = useState<WorkspaceSyncStatus>(() => getWorkspaceSyncStatus());
  const [remote, setRemote] = useState<WorkspaceStorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Choice | null>(null);
  const [working, setWorking] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await inspectWorkspaceSnapshot();
      setRemote(result);
      setConnectionError(null);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not inspect workspace storage.");
      setRemote(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeWorkspaceSyncStatus(setStatus);
    void refresh();
    return unsubscribe;
  }, [refresh]);

  const run = async (choice: Choice) => {
    setWorking(true);
    try {
      await enableWorkspaceSync(choice);
      const latest = getWorkspaceSyncStatus();
      setStatus(latest);
      if (latest.phase === "active") {
        toast.success(choice === "upload" ? "Workspace uploaded and sync enabled" : "Server workspace loaded and sync enabled");
        setPending(null);
      } else if (latest.phase === "error" || latest.phase === "conflict") {
        toast.error(latest.message);
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const tone = status.phase === "active"
    ? "border-line bg-surface"
    : status.phase === "error" || status.phase === "conflict"
      ? "border-high bg-high/20"
      : "border-line bg-surface";

  return (
    <section className={cn("rounded-2xl border p-4", tone)} aria-labelledby="workspace-sync-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="workspace-sync-title" className="font-semibold">Cloud workspace</h2>
          <p className="mt-1 text-sm text-muted">
            Optional cross-device persistence. It is not enabled until you choose a direction below.
          </p>
        </div>
        <span className="rounded-full border border-line px-2 py-1 text-xs capitalize text-muted">{status.phase}</span>
      </div>

      <p className="mt-3 text-sm" role="status" aria-live="polite">
        {loading ? "Checking server storage…" : connectionError ?? status.message}
      </p>

      {remote?.database === "preview" && (
        <p className="mt-2 text-xs text-muted">
          This environment uses an embedded preview database. It can persist between requests, but resets when the preview process restarts; configure PostgreSQL for durable production storage.
        </p>
      )}
      {remote?.database === "postgres" && (
        <p className="mt-2 text-xs text-muted">
          PostgreSQL is configured. This is a personal workspace snapshot, not yet a team-sharing or real-time collaborative workspace.
        </p>
      )}
      {!remote && connectionError && (
        <p className="mt-2 text-xs text-muted">
          Cloud persistence is unavailable until authenticated sign-in is enabled and the server has a working database. Your browser-local workspace remains available.
        </p>
      )}

      {remote?.hasSnapshot && status.phase !== "active" && (
        <p className="mt-2 text-xs text-muted">
          Server snapshot: revision {remote.revision}, last saved {remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : "unknown"}. Loading it replaces this browser’s workspace data after confirmation.
        </p>
      )}
      {status.phase === "active" && status.revision !== undefined && (
        <p className="mt-2 text-xs text-muted">Current server revision: {status.revision}. Edits are saved automatically after a short debounce.</p>
      )}

      {!loading && status.phase !== "active" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {remote && !remote.hasSnapshot && status.phase !== "conflict" && (
            <button type="button" disabled={working} onClick={() => setPending("upload")} className="min-h-10 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg disabled:opacity-50">
              Upload this browser’s workspace
            </button>
          )}
          {remote?.hasSnapshot && (
            <button type="button" disabled={working} onClick={() => setPending("download")} className="min-h-10 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg disabled:opacity-50">
              Load server workspace
            </button>
          )}
          <button type="button" disabled={working} onClick={() => void refresh()} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-50">
            Retry connection
          </button>
        </div>
      )}

      {status.phase === "active" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void refresh()} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">Refresh status</button>
        </div>
      )}

      {pending && (
        <div className="mt-4 rounded-xl border border-high bg-high/20 p-3">
          <p className="text-sm font-semibold">Confirm {pending === "upload" ? "initial upload" : "server restore"}</p>
          <p className="mt-1 text-xs text-muted">
            {pending === "upload"
              ? "The current browser’s tasks, projects, members, notifications, and settings will initialize the personal server snapshot. If a snapshot already exists, the server refuses to overwrite it."
              : "The server snapshot will replace the tasks, projects, members, notifications, and settings in this browser. Export a backup first if you need to preserve local-only edits."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={working} onClick={() => void run(pending)} className="min-h-10 rounded-xl bg-high-ink px-3 text-sm font-semibold text-primary-fg disabled:opacity-50">
              {working ? "Working…" : pending === "upload" ? "Confirm upload" : "Replace with server data"}
            </button>
            <button type="button" disabled={working} onClick={() => setPending(null)} className="min-h-10 rounded-xl px-3 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
