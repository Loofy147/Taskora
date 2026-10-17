import {
  initializeWorkspaceSnapshot,
  inspectWorkspaceSnapshot,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from "./workspace-data";
import { useApp } from "./store";
import type { WorkspaceBackupData } from "./workspace-storage-core.ts";
import { stableWorkspaceJson } from "./stable-json.ts";

export type WorkspaceSyncPhase = "idle" | "connecting" | "active" | "syncing" | "conflict" | "error";

export interface WorkspaceSyncStatus {
  phase: WorkspaceSyncPhase;
  message: string;
  workspaceId?: string;
  revision?: number;
  database?: "postgres" | "preview";
}

type Snapshot = WorkspaceBackupData;
type Session = {
  workspaceId: string;
  revision: number;
  lastSavedSignature: string;
  unsubscribe: (() => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
  pending: Snapshot | null;
  saving: boolean;
};

let session: Session | null = null;
let status: WorkspaceSyncStatus = { phase: "idle", message: "Cloud sync is not enabled in this browser." };
const statusListeners = new Set<(value: WorkspaceSyncStatus) => void>();

const workspaceData = (state = useApp.getState()): Snapshot => ({
  tasks: state.tasks,
  projects: state.projects,
  members: state.members,
  notifications: state.notifications,
  settings: state.settings,
});

function publish(next: WorkspaceSyncStatus): void {
  status = next;
  for (const listener of statusListeners) listener(status);
}

export function getWorkspaceSyncStatus(): WorkspaceSyncStatus {
  return status;
}

export function subscribeWorkspaceSyncStatus(listener: (value: WorkspaceSyncStatus) => void): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
}

function stopSession(): void {
  if (!session) return;
  if (session.timer) clearTimeout(session.timer);
  session.unsubscribe?.();
  session = null;
}

function resumeKey(workspaceId: string): string {
  return `taskora:cloud-sync-enabled:${workspaceId}`;
}

function currentMessage(database: "postgres" | "preview"): string {
  return database === "postgres"
    ? "Changes sync to this account's PostgreSQL workspace."
    : "Connected to the embedded preview database; data may reset when the preview process restarts.";
}

function scheduleSave(active: Session, data: Snapshot): void {
  if (session !== active) return;
  const signature = stableWorkspaceJson(data);
  if (signature === active.lastSavedSignature) return;
  active.pending = data;
  if (active.timer) clearTimeout(active.timer);
  active.timer = setTimeout(() => {
    active.timer = null;
    void flush(active);
  }, 400);
}

async function flush(active: Session): Promise<void> {
  if (session !== active || active.saving) return;
  active.saving = true;
  try {
    while (session === active && active.pending) {
      const payload = active.pending;
      active.pending = null;
      const signature = stableWorkspaceJson(payload);
      if (signature === active.lastSavedSignature) continue;
      publish({
        phase: "syncing",
        message: "Saving the latest workspace changes…",
        workspaceId: active.workspaceId,
        revision: active.revision,
        database: status.database,
      });
      try {
        const result = await saveWorkspaceSnapshot({ data: {
          workspaceId: active.workspaceId,
          expectedRevision: active.revision,
          data: payload,
        } });
        active.revision = result.revision;
        active.lastSavedSignature = signature;
      } catch (error) {
        // Resolve the ambiguous timeout case: the database may have committed
        // even if the browser lost the response. Never blindly repeat a write.
        let latest: Awaited<ReturnType<typeof loadWorkspaceSnapshot>> | null = null;
        try { latest = await loadWorkspaceSnapshot(); } catch { /* offline */ }
        if (latest && stableWorkspaceJson(latest.data) === signature) {
          active.revision = latest.revision;
          active.lastSavedSignature = signature;
          continue;
        }
        if (latest && latest.revision !== active.revision) {
          active.unsubscribe?.();
          active.unsubscribe = null;
          active.pending = null;
          publish({
            phase: "conflict",
            message: "Another session saved newer data. Local edits are still in this browser; load the latest server snapshot to resolve the conflict.",
            workspaceId: active.workspaceId,
            revision: latest.revision,
            database: status.database,
          });
        } else {
          active.unsubscribe?.();
          active.unsubscribe = null;
          active.pending = null;
          publish({
            phase: "error",
            message: error instanceof Error ? `Cloud save failed: ${error.message}` : "Cloud save failed. Local data remains available in this browser.",
            workspaceId: active.workspaceId,
            revision: active.revision,
            database: status.database,
          });
        }
        return;
      }
    }
    if (session === active) {
      publish({
        phase: "active",
        message: currentMessage(status.database ?? "preview"),
        workspaceId: active.workspaceId,
        revision: active.revision,
        database: status.database,
      });
    }
  } finally {
    active.saving = false;
    if (session === active && active.pending && !active.timer) void flush(active);
  }
}

function installSession(snapshot: {
  workspaceId: string;
  revision: number;
  database: "postgres" | "preview";
  data: Snapshot;
}, applyRemote: boolean): void {
  stopSession();
  if (applyRemote) useApp.getState().replaceWorkspaceData(snapshot.data);
  const active: Session = {
    workspaceId: snapshot.workspaceId,
    revision: snapshot.revision,
    lastSavedSignature: stableWorkspaceJson(snapshot.data),
    unsubscribe: null,
    timer: null,
    pending: null,
    saving: false,
  };
  session = active;
  try { localStorage.setItem(resumeKey(snapshot.workspaceId), "1"); } catch { /* session sync still works without resume persistence */ }
  active.unsubscribe = useApp.subscribe((state) => scheduleSave(active, workspaceData(state)));
  publish({
    phase: "active",
    message: currentMessage(snapshot.database),
    workspaceId: snapshot.workspaceId,
    revision: snapshot.revision,
    database: snapshot.database,
  });
}

/** Enable sync only after an explicit upload or download choice in Settings. */
export async function enableWorkspaceSync(mode: "upload" | "download"): Promise<void> {
  stopSession();
  publish({ phase: "connecting", message: mode === "upload" ? "Validating and uploading this browser's workspace…" : "Loading the server workspace…" });
  try {
    if (mode === "upload") {
      const remote = await inspectWorkspaceSnapshot();
      if (remote.hasSnapshot) {
        publish({
          phase: "conflict",
          message: "A server snapshot already exists. Load it first rather than overwriting it with browser data.",
          workspaceId: remote.workspaceId,
          revision: remote.revision ?? undefined,
          database: remote.database,
        });
        return;
      }
      const created = await initializeWorkspaceSnapshot({ data: { data: workspaceData() } });
      installSession(created, false);
      return;
    }

    const loaded = await loadWorkspaceSnapshot();
    if (!loaded) {
      publish({ phase: "error", message: "No server snapshot exists yet. Upload this browser's workspace to initialize it." });
      return;
    }
    installSession(loaded, true);
  } catch (error) {
    publish({
      phase: "error",
      message: error instanceof Error ? error.message : "Could not connect to workspace storage.",
    });
  }
}

/** Resume only for the opaque workspace explicitly enabled in this browser. */
export async function resumeWorkspaceSyncIfEnabled(): Promise<void> {
  try {
    const remote = await inspectWorkspaceSnapshot();
    if (!remote.hasSnapshot || localStorage.getItem(resumeKey(remote.workspaceId)) !== "1") return;
    const snapshot = await loadWorkspaceSnapshot();
    if (!snapshot) return;
    installSession(snapshot, true);
  } catch {
    // Keep local data usable; Settings will expose the server error when opened.
  }
}
