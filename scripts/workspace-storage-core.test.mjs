import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  derivePersonalWorkspaceId,
  normalizeWorkspaceRevision,
  validateWorkspaceSnapshot,
  storageAuthModeAllowsPersistence,
} from "../src/lib/workspace-storage-core.ts";
import { stableWorkspaceJson } from "../src/lib/stable-json.ts";

const validData = () => ({
  tasks: [{
    id: "task-1", title: "Prepare report", summary: "Gather figures", description: "Reconcile numbers",
    status: "todo", priority: "high", projectId: "project-1", due: "2026-10-20",
    assigneeIds: ["hichem"], createdById: "hichem", icon: "clipboard", tone: "rose",
    subtasks: [], comments: [], attachments: [], createdAt: "2026-10-17T12:00:00.000Z", rank: 1,
  }],
  projects: [{ id: "project-1", name: "Finance", description: "Quarter close", status: "active" }],
  members: [{ id: "hichem", name: "Hichem", role: "Admin", title: "Workspace owner", email: "hichem@example.com", tone: 0 }],
  notifications: [],
  settings: { weekStart: "mon", density: "comfortable", digest: false },
});

describe("workspace storage core", () => {
  it("derives stable opaque personal workspace IDs without exposing user IDs", () => {
    const one = derivePersonalWorkspaceId("auth-user-123");
    assert.equal(one, derivePersonalWorkspaceId("auth-user-123"));
    assert.notEqual(one, derivePersonalWorkspaceId("auth-user-456"));
    assert.match(one, /^personal_[a-f0-9]{32}$/);
    assert.equal(one.includes("auth-user-123"), false);
  });

  it("rejects missing or unreasonably long identity values", () => {
    assert.throws(() => derivePersonalWorkspaceId(""), /user identity/i);
    assert.throws(() => derivePersonalWorkspaceId("x".repeat(513)), /user identity/i);
  });

  it("fails closed when the shared demo identity mode disables authentication", () => {
    assert.equal(storageAuthModeAllowsPersistence("false"), false);
    assert.equal(storageAuthModeAllowsPersistence(" false "), false);
    assert.equal(storageAuthModeAllowsPersistence("true"), true);
    assert.equal(storageAuthModeAllowsPersistence(undefined), true);
  });

  it("normalizes only positive safe integer revisions returned by PostgreSQL", () => {
    assert.equal(normalizeWorkspaceRevision("9"), 9);
    assert.equal(normalizeWorkspaceRevision(3), 3);
    assert.equal(normalizeWorkspaceRevision(2n), 2);
    for (const bad of [0, -1, "0", "1.2", "abc", Number.MAX_SAFE_INTEGER + 1, null]) {
      assert.throws(() => normalizeWorkspaceRevision(bad), /revision/i);
    }
  });

  it("canonicalizes JSON object keys without changing array order", () => {
    assert.equal(stableWorkspaceJson({ b: 2, a: 1 }), stableWorkspaceJson({ a: 1, b: 2 }));
    assert.notEqual(stableWorkspaceJson([1, 2]), stableWorkspaceJson([2, 1]));
  });

  it("accepts valid snapshot data through the backup schema validator", () => {
    const result = validateWorkspaceSnapshot(validData());
    assert.equal(result.ok, true);
    assert.equal(result.data.tasks.length, 1);
  });

  it("rejects invalid references and payloads too large for one snapshot", () => {
    const invalid = validData();
    invalid.tasks[0].projectId = "deleted-project";
    assert.equal(validateWorkspaceSnapshot(invalid).ok, false);
    assert.equal(validateWorkspaceSnapshot({ tasks: [], huge: "x".repeat(10 * 1024 * 1024) }).ok, false);
    assert.equal(validateWorkspaceSnapshot(undefined).ok, false);
  });
});
