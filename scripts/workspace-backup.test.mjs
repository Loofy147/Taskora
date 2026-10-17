import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceBackup,
  parseWorkspaceBackup,
  WORKSPACE_BACKUP_FORMAT,
  WORKSPACE_BACKUP_VERSION,
  MAX_WORKSPACE_BACKUP_BYTES,
} from "../src/lib/workspace-backup.ts";

const fixture = () => ({
  tasks: [{
    id: "task-1",
    title: "Prepare quarterly report",
    summary: "Gather the source figures.",
    description: "Reconcile the finance and sales exports.",
    status: "todo",
    priority: "high",
    projectId: "project-1",
    due: "2026-10-20",
    assigneeIds: ["hichem"],
    createdById: "hichem",
    icon: "clipboard",
    tone: "rose",
    subtasks: [{ id: "sub-1", title: "Collect figures", done: false }],
    comments: [{ id: "comment-1", authorId: "hichem", body: "Started.", at: "2026-10-17T12:00:00.000Z" }],
    attachments: [{ id: "attachment-1", name: "figures.xlsx", size: "12 KB", kind: "sheet" }],
    createdAt: "2026-10-17T12:00:00.000Z",
    rank: 1,
  }],
  projects: [{ id: "project-1", name: "Finance", description: "Quarter close", status: "active" }],
  members: [{ id: "hichem", name: "Hichem", role: "Admin", title: "Workspace owner", email: "hichem@example.com", tone: 0 }],
  notifications: [{ id: "notice-1", title: "Task created", body: "A task is ready.", at: "2026-10-17T12:01:00.000Z", read: false, taskId: "task-1" }],
  settings: { weekStart: "mon", density: "comfortable", digest: false },
});

const wrap = (data = fixture()) => JSON.stringify({
  format: WORKSPACE_BACKUP_FORMAT,
  version: WORKSPACE_BACKUP_VERSION,
  exportedAt: "2026-10-17T12:00:00.000Z",
  data,
});

describe("Taskora workspace backups", () => {
  it("round-trips a validated workspace without dropping nested records", () => {
    const source = fixture();
    const text = createWorkspaceBackup(source, "2026-10-17T12:00:00.000Z");
    const parsed = parseWorkspaceBackup(text);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, source);
    assert.equal(parsed.exportedAt, "2026-10-17T12:00:00.000Z");
  });

  it("rejects malformed JSON and files in another format", () => {
    assert.match(parseWorkspaceBackup("{").error, /valid JSON/);
    assert.match(parseWorkspaceBackup(JSON.stringify({ format: "other", version: 1 })).error, /not a Taskora/);
  });

  it("rejects unknown schema versions instead of guessing a migration", () => {
    const backup = JSON.parse(wrap());
    backup.version = WORKSPACE_BACKUP_VERSION + 1;
    assert.match(parseWorkspaceBackup(JSON.stringify(backup)).error, /Unsupported backup version/);
  });

  it("rejects impossible calendar dates and malformed timestamps", () => {
    const data = fixture();
    data.tasks[0].due = "2026-02-30";
    assert.match(parseWorkspaceBackup(wrap(data)).error, /Tasks are malformed/);
    assert.throws(() => createWorkspaceBackup(data), /invalid workspace data/);

    const badTimestamp = fixture();
    badTimestamp.tasks[0].createdAt = "2026-02-30T12:00:00.000Z";
    assert.match(parseWorkspaceBackup(wrap(badTimestamp)).error, /Tasks are malformed/);
    badTimestamp.tasks[0].createdAt = "2026-10-17T28:00:00.000Z";
    assert.match(parseWorkspaceBackup(wrap(badTimestamp)).error, /Tasks are malformed/);

    const badExportedAt = JSON.parse(wrap());
    badExportedAt.exportedAt = "2026-99-99T28:61:00.000Z";
    assert.match(parseWorkspaceBackup(JSON.stringify(badExportedAt)).error, /export timestamp/);
  });

  it("rejects duplicate IDs and dangling project/member/task references", () => {
    const duplicate = fixture();
    duplicate.tasks.push({ ...duplicate.tasks[0] });
    assert.match(parseWorkspaceBackup(wrap(duplicate)).error, /duplicate IDs/);

    const badProject = fixture();
    badProject.tasks[0].projectId = "deleted-project";
    assert.match(parseWorkspaceBackup(wrap(badProject)).error, /missing project/);

    const badAssignee = fixture();
    badAssignee.tasks[0].assigneeIds = ["missing-member"];
    assert.match(parseWorkspaceBackup(wrap(badAssignee)).error, /missing assignee/);

    const badNotice = fixture();
    badNotice.notifications[0].taskId = "deleted-task";
    assert.match(parseWorkspaceBackup(wrap(badNotice)).error, /missing task/);
  });

  it("requires the local profile the current prototype depends on", () => {
    const data = fixture();
    data.members = [];
    assert.match(parseWorkspaceBackup(wrap(data)).error, /required local profile/);
  });

  it("enforces the configured size limit before JSON parsing", () => {
    assert.equal(MAX_WORKSPACE_BACKUP_BYTES, 10 * 1024 * 1024);
    assert.match(parseWorkspaceBackup(" ".repeat(MAX_WORKSPACE_BACKUP_BYTES + 1)).error, /10 MB/);
  });

  it("does not export malformed workspace data", () => {
    const data = fixture();
    data.settings.density = "ultra";
    assert.throws(() => createWorkspaceBackup(data), /Workspace settings are malformed/);
  });
});
