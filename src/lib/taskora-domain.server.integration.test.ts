import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

if (process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "Normalized domain integration tests require isolated embedded PGlite; unset DATABASE_URL to avoid writes to a configured database.",
  );
}

const priorAuthFlag = process.env.VITE_AUTH_ENABLED;
const priorMigrationLoader = process.env.TASKORA_TEST_DB_MIGRATION_LOADER;
process.env.VITE_AUTH_ENABLED = "true";
process.env.TASKORA_TEST_DB_MIGRATION_LOADER = "filesystem";

const { dbSource, getSql } = await import("./db.ts");
const domain = await import("./taskora-domain.server.ts");
const sql = await getSql();

type SeededWorkspace = {
  id: string;
  owner: string;
  member: string;
  viewer: string;
  outsider: string;
};

async function seedWorkspace(): Promise<SeededWorkspace> {
  const id = "domain-workspace-" + randomUUID();
  const owner = "domain-owner-" + randomUUID();
  const member = "domain-member-" + randomUUID();
  const viewer = "domain-viewer-" + randomUUID();
  const outsider = "domain-outsider-" + randomUUID();

  await sql.query(
    "INSERT INTO taskora_workspaces (id, owner_user_id, name, kind) VALUES ($1, $2, $3, 'team')",
    [id, owner, "Integration " + id],
  );
  await sql.query(
    "INSERT INTO taskora_workspace_memberships (workspace_id, user_id, role, status, revoked_at) " +
      "VALUES ($1, $2, 'owner', 'active', NULL), " +
      "($1, $3, 'member', 'active', NULL), ($1, $4, 'viewer', 'active', NULL)",
    [id, owner, member, viewer],
  );
  return { id, owner, member, viewer, outsider };
}

function taskInput(workspaceId: string, projectId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    projectId,
    title: "Prepare integration release",
    description: "Verify domain service behavior",
    status: "todo",
    priority: "high",
    dueDate: "2035-10-20",
    schedule: null,
    assigneeIds: [],
    ...overrides,
  };
}

describe("normalized Taskora domain integration (embedded PGlite only)", () => {
  before(() => {
    assert.equal(dbSource, "pglite", "tests must never use a configured PostgreSQL database");
  });

  after(() => {
    if (priorAuthFlag === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = priorAuthFlag;
    if (priorMigrationLoader === undefined) delete process.env.TASKORA_TEST_DB_MIGRATION_LOADER;
    else process.env.TASKORA_TEST_DB_MIGRATION_LOADER = priorMigrationLoader;
  });

  it("creates projects and tasks, reads them back, filters, and paginates without duplicates", async () => {
    const ws = await seedWorkspace();
    const project = await domain.createProject(ws.owner, {
      workspaceId: ws.id,
      name: "Delivery",
      description: "Integration project",
    });
    assert.equal(project.workspaceId, ws.id);
    assert.equal(project.version, 1);
    assert.equal(project.createdById, ws.owner);

    const first = await domain.createTask(ws.owner, taskInput(ws.id, project.id, { title: "First", assigneeIds: [ws.member] }));
    const second = await domain.createTask(ws.owner, taskInput(ws.id, project.id, { title: "Second", status: "progress" }));
    assert.equal(first.version, 1);
    assert.deepEqual(first.assigneeIds, [ws.member]);
    assert.equal((await domain.getTask(ws.member, { workspaceId: ws.id, taskId: first.id })).id, first.id);

    const firstPage = await domain.listTasks(ws.member, { workspaceId: ws.id, limit: 1 });
    assert.equal(firstPage.items.length, 1);
    assert.ok(firstPage.nextCursor);
    const secondPage = await domain.listTasks(ws.member, {
      workspaceId: ws.id,
      limit: 1,
      cursor: firstPage.nextCursor!,
    });
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.nextCursor, null);
    assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
    assert.deepEqual(
      new Set([firstPage.items[0].id, secondPage.items[0].id]),
      new Set([first.id, second.id]),
    );

    const filtered = await domain.listTasks(ws.member, { workspaceId: ws.id, status: "progress" });
    assert.deepEqual(filtered.items.map((task) => task.id), [second.id]);
    const projects = await domain.listProjects(ws.member, ws.id);
    assert.deepEqual(projects.map((item) => item.id), [project.id]);
  });

  it("uses expected versions, rejects stale updates, and soft-archives transactionally", async () => {
    const ws = await seedWorkspace();
    const project = await domain.createProject(ws.owner, { workspaceId: ws.id, name: "Operations", description: "" });
    const task = await domain.createTask(ws.owner, taskInput(ws.id, project.id, { assigneeIds: [ws.member] }));

    const updated = await domain.updateTask(ws.member, task.id, {
      workspaceId: ws.id,
      taskId: task.id,
      expectedVersion: 1,
      status: "done",
    });
    assert.equal(updated.status, "done");
    assert.equal(updated.version, 2);

    await assert.rejects(
      domain.updateTask(ws.member, task.id, {
        workspaceId: ws.id,
        taskId: task.id,
        expectedVersion: 1,
        title: "Stale write",
      }),
      (error: unknown) =>
        error instanceof domain.TaskoraDomainError &&
        error.code === "TASK_VERSION_CONFLICT" &&
        error.status === 409,
    );

    await assert.rejects(
      domain.archiveTask(ws.member, {
        workspaceId: ws.id,
        taskId: task.id,
        expectedVersion: 2,
      }),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.status === 403,
    );

    const archived = await domain.archiveTask(ws.owner, {
      workspaceId: ws.id,
      taskId: task.id,
      expectedVersion: 2,
    });
    assert.equal(archived.version, 3);
    assert.ok(archived.archivedAt);
    assert.equal((await domain.listTasks(ws.owner, { workspaceId: ws.id })).items.length, 0);
    await assert.rejects(
      domain.getTask(ws.owner, { workspaceId: ws.id, taskId: task.id }),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.status === 404,
    );
  });

  it("denies outsiders and viewers and never resolves cross-workspace project IDs", async () => {
    const wsA = await seedWorkspace();
    const wsB = await seedWorkspace();
    const projectA = await domain.createProject(wsA.owner, {
      workspaceId: wsA.id,
      name: "Private project",
      description: "",
    });
    await assert.rejects(
      domain.listTasks(wsA.outsider, { workspaceId: wsA.id }),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.status === 403,
    );
    await assert.rejects(
      domain.createProject(wsA.member, { workspaceId: wsA.id, name: "Not allowed", description: "" }),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.status === 403,
    );
    await assert.rejects(
      domain.createTask(wsA.viewer, taskInput(wsA.id, projectA.id)),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.status === 403,
    );
    await assert.rejects(
      domain.createTask(wsB.owner, taskInput(wsB.id, projectA.id)),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.code === "PROJECT_NOT_FOUND",
    );
    const rows = await sql.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM taskora_tasks WHERE workspace_id = $1",
      [wsB.id],
    );
    assert.equal(rows[0].count, 0);
  });

  it("enforces active same-workspace assignees and the member self-assignment boundary", async () => {
    const ws = await seedWorkspace();
    const project = await domain.createProject(ws.owner, { workspaceId: ws.id, name: "Team", description: "" });

    await assert.rejects(
      domain.createTask(ws.member, taskInput(ws.id, project.id, { assigneeIds: [ws.owner] })),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.code === "TASK_ASSIGNMENT_FORBIDDEN",
    );
    const selfAssigned = await domain.createTask(
      ws.member,
      taskInput(ws.id, project.id, { assigneeIds: [ws.member] }),
    );
    assert.deepEqual(selfAssigned.assigneeIds, [ws.member]);

    await sql.query(
      "UPDATE taskora_workspace_memberships SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP " +
        "WHERE workspace_id = $1 AND user_id = $2",
      [ws.id, ws.member],
    );
    await assert.rejects(
      domain.createTask(ws.owner, taskInput(ws.id, project.id, { assigneeIds: [ws.member] })),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.code === "INVALID_ASSIGNEE",
    );
    const task = await domain.getTask(ws.owner, { workspaceId: ws.id, taskId: selfAssigned.id });
    assert.equal(task.version, 1);
  });

  it("rolls back every statement when a transaction callback fails", async () => {
    const ws = await seedWorkspace();
    const projectId = "rollback-project-" + randomUUID();
    await assert.rejects(
      sql.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO taskora_projects (id, workspace_id, name, description, status, created_by_user_id, version) " +
            "VALUES ($1, $2, 'Rollback probe', '', 'active', $3, 1)",
          [projectId, ws.id, ws.owner],
        );
        throw new Error("intentional rollback probe");
      }),
      /intentional rollback probe/,
    );
    const rows = await sql.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM taskora_projects WHERE id = $1",
      [projectId],
    );
    assert.equal(rows[0].count, 0);
  });

  it("rejects malformed task-list cursors before querying the database", async () => {
    const ws = await seedWorkspace();
    await assert.rejects(
      domain.listTasks(ws.owner, { workspaceId: ws.id, cursor: "not-a-valid-cursor" }),
      (error: unknown) => error instanceof domain.TaskoraDomainError && error.code === "INVALID_CURSOR",
    );
  });
});
