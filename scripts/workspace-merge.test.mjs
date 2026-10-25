import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeWorkspaceRecords } from "../src/lib/workspace-merge.ts";

const task = (id, patch = {}) => ({
  id, title: "Provision PostgreSQL", summary: "Configure durable storage.", description: "Keep existing work.",
  status: "progress", priority: "high", projectId: "taskora", due: "", assigneeIds: [],
  createdById: "hichem", icon: "clipboard", tone: "rose", subtasks: [], comments: [],
  attachments: [], createdAt: "2026-10-20T10:00:00.000Z", rank: 1, ...patch,
});
const project = (id, patch = {}) => ({ id, name: "Taskora", description: "Existing project state.", status: "active", ...patch });
const member = { id: "hichem", name: "Workspace owner", role: "Owner", title: "Personal workspace owner", email: "", tone: 0 };
const data = (tasks = [], projects = [], members = [member], notifications = [], settings = { weekStart: "mon", density: "comfortable", digest: false }) =>
  ({ tasks, projects, members, notifications, settings });

describe("additive Taskora workspace merge", () => {
  it("adds new projects/tasks and preserves existing task edits and settings", () => {
    const current = data([task("old", { title: "My edit", due: "" })], [project("taskora")]);
    const incoming = data(
      [task("new", { title: "Imported source task", description: "Acceptance criteria.\nSource record: https://app.notion.com/p/source" })],
      [project("new-project", { name: "New project", description: "Outcome.\nSource record: https://app.notion.com/p/project" })],
      [{ ...member, email: "imported@example.invalid" }],
      [],
      { weekStart: "sun", density: "compact", digest: true },
    );
    const result = mergeWorkspaceRecords(current, incoming);
    assert.equal(result.counts.addedProjects, 1);
    assert.equal(result.counts.addedTasks, 1);
    assert.equal(result.counts.addedMembers, 0);
    assert.equal(result.data.tasks.find((item) => item.id === "old").title, "My edit");
    assert.equal(result.data.settings.weekStart, "mon");
    assert.equal(result.data.settings.density, "comfortable");
    assert.ok(result.data.tasks.some((item) => item.id === "new"));
    assert.equal(result.data.members.length, 1);
  });

  it("enriches matching records with canonical source context but preserves field edits", () => {
    const current = data([task("same", { title: "Edited title", status: "done", priority: "low", description: "User notes." })], [project("same-project", { name: "My renamed project" })]);
    const incoming = data(
      [task("same", { title: "Seed title", status: "todo", description: "Acceptance criteria.\nSource record: https://app.notion.com/p/source" })],
      [project("same-project", { name: "Original project", description: "Outcome.\nSource record: https://app.notion.com/p/project" })],
    );
    const result = mergeWorkspaceRecords(current, incoming);
    assert.equal(result.data.tasks[0].title, "Edited title");
    assert.equal(result.data.tasks[0].status, "done");
    assert.equal(result.data.tasks[0].priority, "low");
    assert.match(result.data.tasks[0].description, /https:\/\/app\.notion\.com\/p\/source/);
    assert.equal(result.data.projects[0].name, "My renamed project");
    assert.match(result.data.projects[0].description, /https:\/\/app\.notion\.com\/p\/project/);
    assert.equal(result.counts.enrichedTasks, 1);
    assert.equal(result.counts.enrichedProjects, 1);
  });

  it("is idempotent on repeated imports", () => {
    const current = data([], []);
    const incoming = data(
      [task("new", { description: "Context.\nSource record: https://app.notion.com/p/source" })],
      [project("new-project", { description: "Context.\nSource record: https://app.notion.com/p/project" })],
    );
    const once = mergeWorkspaceRecords(current, incoming);
    const twice = mergeWorkspaceRecords(once.data, incoming);
    assert.equal(once.data.tasks.length, twice.data.tasks.length);
    assert.equal(once.data.projects.length, twice.data.projects.length);
    assert.equal(twice.counts.addedTasks, 0);
    assert.equal(twice.counts.addedProjects, 0);
    assert.equal(twice.counts.enrichedTasks, 0);
    assert.equal(twice.counts.enrichedProjects, 0);
  });
});
