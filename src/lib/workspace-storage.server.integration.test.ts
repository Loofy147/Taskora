import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

// Never allow integration tests to write into configured staging/production storage.
if (process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "Workspace storage integration tests require embedded PGlite; unset DATABASE_URL to prevent writes to a configured database.",
  );
}

const priorAuthFlag = process.env.VITE_AUTH_ENABLED;
const priorMigrationLoader = process.env.TASKORA_TEST_DB_MIGRATION_LOADER;
process.env.VITE_AUTH_ENABLED = "true";
process.env.TASKORA_TEST_DB_MIGRATION_LOADER = "filesystem";

// Load the storage service only after selecting authenticated mode.
const { dbSource, getSql } = await import("./db.ts");
const storage = await import("./workspace-storage.server.ts");
const sql = await getSql();

const validData = (title = "Prepare report") => ({
  tasks: [{
    id: "task-1",
    title,
    summary: "Gather figures",
    description: "Reconcile numbers",
    status: "todo",
    priority: "high",
    projectId: "project-1",
    due: "2035-10-20",
    assigneeIds: ["hichem"],
    createdById: "hichem",
    icon: "clipboard",
    tone: "rose",
    subtasks: [],
    comments: [],
    attachments: [],
    createdAt: "2026-10-17T12:00:00.000Z",
    rank: 1,
  }],
  projects: [{ id: "project-1", name: "Finance", description: "Quarter close", status: "active" }],
  members: [{ id: "hichem", name: "Hichem", role: "Admin", title: "Workspace owner", email: "hichem@example.com", tone: 0 }],
  notifications: [],
  settings: { weekStart: "mon", density: "comfortable", digest: false },
});

const testUser = (label: string) => "integration-" + label + "-" + randomUUID();

describe("workspace storage server integration (embedded PGlite only)", () => {
  before(() => {
    assert.equal(dbSource, "pglite", "the integration suite must use an isolated embedded database");
  });

  after(() => {
    if (priorAuthFlag === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = priorAuthFlag;
    if (priorMigrationLoader === undefined) delete process.env.TASKORA_TEST_DB_MIGRATION_LOADER;
    else process.env.TASKORA_TEST_DB_MIGRATION_LOADER = priorMigrationLoader;
  });

  it("keeps inspection read-only until a user explicitly initializes cloud storage", async () => {
    const userId = testUser("inspect");
    const status = await storage.inspectPersonalWorkspace(userId);
    assert.equal(status.hasSnapshot, false);
    assert.equal(status.revision, null);
    const rows = await sql.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM taskora_workspaces WHERE owner_user_id = $1",
      [userId],
    );
    assert.equal(rows[0].count, 0);
  });

  it("round-trips a snapshot and isolates different authenticated user IDs", async () => {
    const userA = testUser("owner-a");
    const userB = testUser("owner-b");
    const created = await storage.initializePersonalWorkspaceSnapshot(userA, validData());
    assert.equal(created.revision, 1);
    assert.deepEqual(created.data, validData());

    const loadedA = await storage.loadPersonalWorkspaceSnapshot(userA);
    assert.equal(loadedA?.workspaceId, created.workspaceId);
    assert.deepEqual(loadedA?.data, validData());

    const inspectedB = await storage.inspectPersonalWorkspace(userB);
    assert.notEqual(inspectedB.workspaceId, created.workspaceId);
    assert.equal(inspectedB.hasSnapshot, false);
    assert.equal(await storage.loadPersonalWorkspaceSnapshot(userB), null);

    await assert.rejects(
      storage.savePersonalWorkspaceSnapshot({
        userId: userB,
        workspaceId: created.workspaceId,
        expectedRevision: 1,
        data: validData("Cross-account overwrite"),
      }),
      (error: unknown) => error instanceof storage.WorkspaceAccessError,
    );
    const stillA = await storage.loadPersonalWorkspaceSnapshot(userA);
    assert.equal(stillA?.data.tasks[0].title, "Prepare report");
  });

  it("allows only one concurrent initialization and records one initial event", async () => {
    const userId = testUser("init-race");
    const results = await Promise.allSettled([
      storage.initializePersonalWorkspaceSnapshot(userId, validData("Initial A")),
      storage.initializePersonalWorkspaceSnapshot(userId, validData("Initial B")),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.ok(rejected.reason instanceof storage.WorkspaceSnapshotConflictError);

    const current = await storage.loadPersonalWorkspaceSnapshot(userId);
    assert.equal(current?.revision, 1);
    const events = await sql.query<{ action: string; revision: number }>(
      "SELECT action, revision FROM taskora_workspace_events WHERE workspace_id = $1 ORDER BY revision",
      [current?.workspaceId],
    );
    assert.deepEqual(events, [{ action: "initialized", revision: 1 }]);
  });

  it("uses compare-and-swap for concurrent updates and logs only the winner", async () => {
    const userId = testUser("save-race");
    const initial = await storage.initializePersonalWorkspaceSnapshot(userId, validData());
    const attempts = await Promise.allSettled([
      storage.savePersonalWorkspaceSnapshot({
        userId,
        workspaceId: initial.workspaceId,
        expectedRevision: 1,
        data: validData("Writer A"),
      }),
      storage.savePersonalWorkspaceSnapshot({
        userId,
        workspaceId: initial.workspaceId,
        expectedRevision: 1,
        data: validData("Writer B"),
      }),
    ]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = attempts.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.ok(rejected.reason instanceof storage.WorkspaceSnapshotConflictError);
    assert.equal(rejected.reason.currentRevision, 2);

    const finalSnapshot = await storage.loadPersonalWorkspaceSnapshot(userId);
    assert.equal(finalSnapshot?.revision, 2);
    assert.ok(["Writer A", "Writer B"].includes(finalSnapshot?.data.tasks[0].title ?? ""));
    const events = await sql.query<{ action: string; revision: number }>(
      "SELECT action, revision FROM taskora_workspace_events WHERE workspace_id = $1 ORDER BY revision",
      [initial.workspaceId],
    );
    assert.deepEqual(events, [
      { action: "initialized", revision: 1 },
      { action: "snapshot_saved", revision: 2 },
    ]);
  });

  it("rejects invalid payloads without advancing revisions or writing events", async () => {
    const userId = testUser("invalid");
    const initial = await storage.initializePersonalWorkspaceSnapshot(userId, validData());
    const invalid = validData();
    invalid.tasks[0].projectId = "missing-project";
    await assert.rejects(
      storage.savePersonalWorkspaceSnapshot({
        userId,
        workspaceId: initial.workspaceId,
        expectedRevision: 1,
        data: invalid,
      }),
      /Invalid workspace snapshot/,
    );

    const current = await storage.loadPersonalWorkspaceSnapshot(userId);
    assert.equal(current?.revision, 1);
    const events = await sql.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM taskora_workspace_events WHERE workspace_id = $1",
      [initial.workspaceId],
    );
    assert.equal(events[0].count, 1);
  });

  it("fails closed when shared demo identity mode is explicitly enabled", async () => {
    process.env.VITE_AUTH_ENABLED = " false ";
    await assert.rejects(
      storage.inspectPersonalWorkspace(testUser("demo-guard")),
      (error: unknown) => error instanceof storage.WorkspaceStorageUnavailableError,
    );
  });
});
