import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CreateTaskInputSchema,
  DateKeySchema,
  ROLE_CAPABILITIES,
  ScheduleIntervalSchema,
  TaskRecordSchema,
  UpdateTaskInputSchema,
  WORKSPACE_CAPABILITIES,
  WorkspaceDomainSnapshotSchema,
  roleCan,
} from "../src/lib/domain-contracts.ts";

const instant = "2026-10-18T12:00:00.000Z";

function validSnapshot() {
  return {
    memberships: [
      {
        workspaceId: "workspace-1",
        userId: "user-owner",
        role: "owner",
        status: "active",
        joinedAt: instant,
        revokedAt: null,
      },
      {
        workspaceId: "workspace-1",
        userId: "user-member",
        role: "member",
        status: "active",
        joinedAt: instant,
        revokedAt: null,
      },
    ],
    projects: [
      {
        id: "project-1",
        workspaceId: "workspace-1",
        name: "Delivery",
        description: "",
        status: "active",
        createdById: "user-owner",
        version: 1,
        createdAt: instant,
        updatedAt: instant,
        archivedAt: null,
      },
    ],
    tasks: [
      {
        id: "task-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        title: "Prepare release",
        description: "",
        status: "todo",
        priority: "high",
        dueDate: "2026-10-20",
        schedule: null,
        assigneeIds: ["user-member"],
        createdById: "user-owner",
        version: 1,
        createdAt: instant,
        updatedAt: instant,
        archivedAt: null,
      },
    ],
    subtasks: [
      {
        id: "subtask-1",
        workspaceId: "workspace-1",
        taskId: "task-1",
        title: "Write notes",
        completed: false,
        rank: 0,
        version: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    ],
    comments: [
      {
        id: "comment-1",
        workspaceId: "workspace-1",
        taskId: "task-1",
        authorId: "user-member",
        body: "I will take this.",
        version: 1,
        createdAt: instant,
        updatedAt: instant,
      },
    ],
  };
}

describe("Taskora normalized domain contracts", () => {
  it("accepts a consistent workspace graph and permits date-only deadlines without a schedule", () => {
    const snapshot = validSnapshot();
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(snapshot).success, true);
    assert.equal(TaskRecordSchema.safeParse(snapshot.tasks[0]).success, true);
    assert.equal(snapshot.tasks[0].schedule, null);
    assert.equal(snapshot.tasks[0].dueDate, "2026-10-20");
  });

  it("rejects impossible calendar dates instead of relying on Date.parse normalization", () => {
    assert.equal(DateKeySchema.safeParse("2026-02-28").success, true);
    assert.equal(DateKeySchema.safeParse("2026-02-30").success, false);
    assert.equal(DateKeySchema.safeParse("2026-2-3").success, false);
  });

  it("requires an absolute timestamp and a valid, increasing schedule interval", () => {
    const valid = {
      startsAt: "2026-11-01T09:00:00-04:00",
      endsAt: "2026-11-01T10:00:00-04:00",
      timeZone: "America/New_York",
    };
    assert.equal(ScheduleIntervalSchema.safeParse(valid).success, true);
    assert.equal(
      ScheduleIntervalSchema.safeParse({
        ...valid,
        endsAt: "2026-11-01T08:00:00-04:00",
      }).success,
      false,
    );
    assert.equal(
      ScheduleIntervalSchema.safeParse({
        ...valid,
        startsAt: "2026-11-01T09:00:00",
      }).success,
      false,
    );
    assert.equal(
      ScheduleIntervalSchema.safeParse({
        ...valid,
        timeZone: "Mars/Olympus",
      }).success,
      false,
    );
  });

  it("rejects task writes with duplicate assignees or invalid versions", () => {
    const snapshot = validSnapshot();
    assert.equal(
      TaskRecordSchema.safeParse({
        ...snapshot.tasks[0],
        assigneeIds: ["user-member", "user-member"],
      }).success,
      false,
    );
    assert.equal(
      TaskRecordSchema.safeParse({
        ...snapshot.tasks[0],
        version: 0,
      }).success,
      false,
    );
  });

  it("rejects a missing project and a cross-workspace project reference", () => {
    const missingProject = validSnapshot();
    missingProject.projects = [];
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(missingProject).success, false);

    const crossWorkspace = validSnapshot();
    crossWorkspace.tasks[0].workspaceId = "workspace-2";
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(crossWorkspace).success, false);
  });

  it("rejects assignees that are not active members of the same workspace", () => {
    const outsider = validSnapshot();
    outsider.tasks[0].assigneeIds = ["user-outside"];
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(outsider).success, false);

    const revoked = validSnapshot();
    revoked.memberships[1].status = "revoked";
    revoked.memberships[1].revokedAt = instant;
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(revoked).success, false);
  });

  it("rejects duplicate membership identities and workspaces without exactly one active owner", () => {
    const duplicateMembership = validSnapshot();
    duplicateMembership.memberships.push({ ...duplicateMembership.memberships[1] });
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(duplicateMembership).success, false);

    const twoOwners = validSnapshot();
    twoOwners.memberships.push({
      workspaceId: "workspace-1",
      userId: "user-owner-2",
      role: "owner",
      status: "active",
      joinedAt: instant,
      revokedAt: null,
    });
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(twoOwners).success, false);

    const noOwner = validSnapshot();
    noOwner.memberships[0].role = "admin";
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(noOwner).success, false);
  });

  it("rejects dangling subtasks, cross-workspace comments, and inactive comment authors", () => {
    const danglingSubtask = validSnapshot();
    danglingSubtask.subtasks[0].taskId = "missing-task";
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(danglingSubtask).success, false);

    const crossWorkspaceComment = validSnapshot();
    crossWorkspaceComment.comments[0].workspaceId = "workspace-2";
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(crossWorkspaceComment).success, false);

    const inactiveAuthor = validSnapshot();
    inactiveAuthor.memberships[1].status = "revoked";
    inactiveAuthor.memberships[1].revokedAt = instant;
    assert.equal(WorkspaceDomainSnapshotSchema.safeParse(inactiveAuthor).success, false);
  });

  it("keeps actor identity, creator, IDs, and version out of client create-task inputs", () => {
    const input = {
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "New task",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
      schedule: null,
      assigneeIds: [],
    };
    assert.equal(CreateTaskInputSchema.safeParse(input).success, true);

    for (const field of ["actorId", "userId", "createdById", "id", "version", "createdAt"]) {
      assert.equal(
        CreateTaskInputSchema.safeParse({ ...input, [field]: "client-controlled" }).success,
        false,
        field + " must not be accepted from the client.",
      );
    }
  });

  it("requires compare-and-swap versioning and a non-empty task patch", () => {
    assert.equal(UpdateTaskInputSchema.safeParse({ workspaceId: "workspace-1", taskId: "task-1", expectedVersion: 1 }).success, false);
    assert.equal(
      UpdateTaskInputSchema.safeParse({ workspaceId: "workspace-1", taskId: "task-1", expectedVersion: 1, status: "done" }).success,
      true,
    );
    assert.equal(
      UpdateTaskInputSchema.safeParse({ workspaceId: "workspace-1", taskId: "task-1", expectedVersion: 0, status: "done" }).success,
      false,
    );
    assert.equal(
      UpdateTaskInputSchema.safeParse({ workspaceId: "workspace-1", taskId: "task-1", expectedVersion: 1, role: "owner" }).success,
      false,
    );
  });
});

describe("Taskora workspace capability policy", () => {
  it("defines the complete expected role-by-capability matrix", () => {
    const expected = {
      owner: [...WORKSPACE_CAPABILITIES],
      admin: WORKSPACE_CAPABILITIES.filter((capability) => capability !== "workspace:transfer-owner"),
      member: [
        "workspace:read",
        "project:read",
        "task:read",
        "task:create",
        "task:update",
        "subtask:create",
        "comment:create",
      ],
      viewer: ["workspace:read", "project:read", "task:read"],
    };

    for (const role of Object.keys(expected)) {
      assert.deepEqual(ROLE_CAPABILITIES[role], expected[role]);
      for (const capability of WORKSPACE_CAPABILITIES) {
        assert.equal(roleCan(role, capability), expected[role].includes(capability), role + " / " + capability);
      }
    }
  });

  it("prevents admin ownership transfer and all viewer mutations", () => {
    assert.equal(roleCan("admin", "workspace:transfer-owner"), false);
    assert.equal(roleCan("owner", "workspace:transfer-owner"), true);
    for (const capability of WORKSPACE_CAPABILITIES.filter((item) => item.includes(":create") || item.includes(":update") || item.includes(":archive") || item.includes(":assign") || item.includes(":manage") || item.includes(":invite") || item.includes("transfer-owner"))) {
      assert.equal(roleCan("viewer", capability), false, capability);
    }
  });
});
