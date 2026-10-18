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
