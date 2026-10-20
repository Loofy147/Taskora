import assert from "node:assert/strict";
import test from "node:test";
import { PORTFOLIO_PROJECTS, PORTFOLIO_TASKS } from "../src/lib/portfolio-seed.ts";
import { migratePortfolioState } from "../src/lib/portfolio-migration.ts";

test("canonical portfolio contains real workstreams and actionable acceptance tasks", () => {
  assert.ok(PORTFOLIO_PROJECTS.length >= 12);
  assert.ok(PORTFOLIO_TASKS.length >= 50);
  const projectIds = new Set(PORTFOLIO_PROJECTS.map((project) => project.id));
  assert.equal(projectIds.size, PORTFOLIO_PROJECTS.length);
  assert.equal(new Set(PORTFOLIO_PROJECTS.map((project) => project.requestId)).size, PORTFOLIO_PROJECTS.length);
  assert.equal(new Set(PORTFOLIO_TASKS.map((task) => task.id)).size, PORTFOLIO_TASKS.length);
  assert.equal(new Set(PORTFOLIO_TASKS.map((task) => task.requestId)).size, PORTFOLIO_TASKS.length);

  for (const task of PORTFOLIO_TASKS) {
    assert.ok(projectIds.has(task.projectId), "unknown project for " + task.id);
    assert.ok(task.title.trim().length >= 8, "weak task title: " + task.id);
    assert.ok(task.summary.trim().length > 20, "missing context: " + task.id);
    assert.ok(task.description.trim().length > 40, "missing acceptance/detail: " + task.id);
    assert.ok(["todo", "progress", "done"].includes(task.status));
    assert.ok(["low", "medium", "high"].includes(task.priority));
    assert.match(task.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
  const names = PORTFOLIO_PROJECTS.map((project) => project.name).join(" ");
  for (const expected of ["Taskora", "Pyramiding Simulator", "Za3im", "Youta", "ContribQuest"]) {
    assert.ok(names.includes(expected), "missing expected workstream " + expected);
  }
  assert.doesNotMatch(names, /E-commerce Platform|Brand Refresh|Q4 Marketing|Client Success/);
  assert.ok(PORTFOLIO_TASKS.every((task) => task.status !== "done" || /evidence|passed|verified|completed/i.test(task.summary + " " + task.description)));
});

test("personal baseline has no invented deadlines, collaborators, files, comments or notices", async () => {
  const { buildData } = await import("../src/lib/seed.ts");
  const data = buildData();
  assert.equal(data.projects.length, PORTFOLIO_PROJECTS.length);
  assert.equal(data.tasks.length, PORTFOLIO_TASKS.length);
  assert.deepEqual(data.members.map((member) => member.id), ["hichem"]);
  assert.equal(data.notifications.length, 0);
  for (const task of data.tasks) {
    assert.equal(task.due, "");
    assert.deepEqual(task.assigneeIds, []);
    assert.equal(task.comments.length, 0);
    assert.equal(task.attachments.length, 0);
    assert.ok(task.description.includes("Acceptance / next evidence"));
  }
});

test("migration replaces exact demo fixtures but retains user-created records", () => {
  const baseline = {
    tasks: [{ id: "taskora-postgres-auth", projectId: "taskora", title: "Canonical task" }],
    projects: [{ id: "taskora", name: "Taskora" }],
    members: [{ id: "hichem", name: "Workspace owner", email: "" }],
    notifications: [],
    settings: { density: "comfortable" },
  };
  const migrated = migratePortfolioState({
    tasks: [
      { id: "task-catalog", projectId: "ecom", title: "Old fixture" },
      { id: "my-real-task", projectId: "ecom", title: "Actual work", assigneeIds: ["sara"], createdById: "hichem" },
    ],
    projects: [
      { id: "ecom", name: "E-commerce Platform", description: "old fixture", status: "active" },
      { id: "my-project", name: "My real project", description: "keep", status: "active" },
    ],
    members: [
      { id: "hichem", name: "Hichem", email: "hichem@example.com", role: "Admin", title: "Workspace owner", tone: 0 },
      { id: "sara", name: "Sara Benali", email: "sara@example.com", role: "Design", title: "Designer", tone: 3 },
    ],
    notifications: [
      { id: "n-1", title: "Sample notice", taskId: "task-catalog" },
      { id: "my-notice", title: "My notice", taskId: "my-real-task" },
    ],
    settings: { density: "compact" },
  }, baseline);

  assert.equal(migrated.tasks.some((task) => task.id === "task-catalog"), false);
  assert.equal(migrated.tasks.some((task) => task.id === "my-real-task"), true);
  assert.equal(migrated.tasks.some((task) => task.id === "taskora-postgres-auth"), true);
  assert.equal(migrated.projects.some((project) => project.id === "my-project"), true);
  assert.equal(migrated.projects.find((project) => project.id === "ecom").name, "Recovered legacy project — E-commerce Platform (review)");
  assert.equal(migrated.members.find((member) => member.id === "sara").name, "Legacy collaborator — identity unverified");
  assert.equal(migrated.members.find((member) => member.id === "sara").email, "");
  assert.equal(migrated.members.find((member) => member.id === "hichem").email, "");
  assert.equal(migrated.notifications.some((notice) => notice.id === "n-1"), false);
  assert.equal(migrated.notifications.some((notice) => notice.id === "my-notice"), true);
  assert.deepEqual(migrated.settings, { density: "compact" });
});

test("migration preserves edited tasks and removes unused demo projects and orphan notices", () => {
  const baseline = {
    tasks: [{ id: "portfolio-task", projectId: "taskora" }],
    projects: [{ id: "taskora", name: "Taskora" }],
    members: [{ id: "hichem", name: "Workspace owner", email: "" }],
    notifications: [],
    settings: {},
  };
  const migrated = migratePortfolioState({
    tasks: [{ id: "my-task", projectId: "ecom", title: "Customized task", assigneeIds: [], createdById: "hichem" }],
    projects: [{ id: "ecom", name: "E-commerce Platform" }, { id: "extra", name: "Extra" }],
    members: [{ id: "hichem", name: "Hichem", email: "hichem@example.com" }],
    notifications: [{ id: "notice-orphan", title: "Orphaned", taskId: "task-catalog" }],
    settings: {},
  }, baseline);
  assert.ok(migrated.tasks.some((task) => task.id === "my-task"));
  assert.ok(migrated.projects.some((project) => project.id === "ecom"));
  assert.ok(migrated.projects.some((project) => project.id === "extra"));
  assert.equal(migrated.notifications.length, 0);
});
