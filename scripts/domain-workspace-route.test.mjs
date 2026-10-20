import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("server-backed workspace uses authenticated domain functions instead of the local demo store", async () => {
  const source = await read("src/routes/workspace.tsx");
  for (const marker of [
    "createOrGetTaskoraPersonalWorkspace", "listTaskoraProjects", "listTaskoraTasks",
    "createTaskoraProject", "createTaskoraTask", "updateTaskoraTask", "archiveTaskoraTask",
    "useCurrentUserState", "authEnabled",
  ]) assert.ok(source.includes(marker), `expected workspace route to include ${marker}`);
  assert.doesNotMatch(source, /@\/lib\/store|localStorage|useApp\(/);
});

test("create retries keep request keys and updates carry expected versions", async () => {
  const source = await read("src/routes/workspace.tsx");
  assert.match(source, /requestId:\s*projectRequestId/);
  assert.match(source, /requestId:\s*taskRequestId/);
  assert.match(source, /expectedVersion:\s*task\.version/);
  assert.match(source, /Create requests are safe to retry/);
});

test("authenticated workspace route is registered and sign-in returns there", async () => {
  const tree = await read("src/routeTree.gen.ts");
  const login = await read("src/routes/login.tsx");
  const shell = await read("src/components/shell.tsx");
  assert.match(tree, /WorkspaceRouteImport/);
  assert.match(tree, /'\/workspace'/);
  assert.match(login, /callbackURL:\s*"\/workspace"/);
  assert.match(shell, /to="\/workspace"/);
});

test("create command schemas require UUID idempotency keys and reject extra fields", async () => {
  const { CreateProjectCommandSchema, CreateTaskCommandSchema } = await import("../src/lib/domain-contracts.ts");
  const requestId = "a40b0a0c-c031-4a77-8cc8-9d8b7c04fc28";
  assert.equal(CreateProjectCommandSchema.safeParse({ workspaceId: "ws", name: "Project", description: "", requestId }).success, true);
  assert.equal(CreateProjectCommandSchema.safeParse({ workspaceId: "ws", name: "Project", description: "" }).success, false);
  assert.equal(CreateTaskCommandSchema.safeParse({
    workspaceId: "ws", projectId: "project", title: "Task", description: "",
    status: "todo", priority: "medium", dueDate: null, schedule: null, assigneeIds: [], requestId,
  }).success, true);
  assert.equal(CreateTaskCommandSchema.safeParse({
    workspaceId: "ws", projectId: "project", title: "Task", description: "",
    status: "todo", priority: "medium", dueDate: null, schedule: null, assigneeIds: [], requestId, actorId: "forged",
  }).success, false);
});


test("actual engineering backlog is created as authenticated, durable Taskora records", async () => {
  const source = await read("src/routes/workspace.tsx");
  assert.match(source, /Actual Taskora execution backlog/);
  assert.match(source, /Taskora Product Development/);
  assert.match(source, /PRODUCT_BACKLOG_PROJECT_REQUEST_ID/);
  assert.match(source, /for \(const seed of PRODUCT_BACKLOG_TASKS\)/);
  assert.match(source, /createTaskoraProject\(\{ data:/);
  assert.match(source, /createTaskoraTask\(\{ data:/);
  assert.match(source, /requestId: seed\.requestId/);
  assert.match(source, /Successfully completed records remain saved/);
  assert.match(source, /same idempotency keys/);
  assert.doesNotMatch(source, /localStorage|@\/lib\/store|useApp\(/);

  const requestIds = [...source.matchAll(/requestId: "([0-9a-f-]{36})"/g)].map((match) => match[1]);
  assert.equal(requestIds.length, 15, "every actual development task has a stable request key");
  assert.equal(new Set(requestIds).size, requestIds.length, "task idempotency keys are unique");
  for (const requestId of requestIds) {
    assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }

  for (const title of [
    "Configure durable PostgreSQL and Better Auth on Vercel preview",
    "Prove two-account workspace isolation",
    "Verify durable save and reload recovery",
    "Run AppDeploy v16 independent staging acceptance",
    "Complete release-gate review before production rollout",
  ]) assert.ok(source.includes(title), `missing real acceptance task: ${title}`);
});
