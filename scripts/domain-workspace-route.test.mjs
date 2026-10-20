import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("server-backed workspace uses authenticated domain functions instead of the local demo store", async () => {
  const source = await read("src/routes/workspace.tsx");
  for (const marker of [
    "createOrGetTaskoraPersonalWorkspace", "listTaskoraProjects", "listTaskoraTasks",
    "createTaskoraProject", "createTaskoraTask", "updateTaskoraTask", "archiveTaskoraTask",
    "useCurrentUserState", "authEnabled",
  ]) assert.ok(source.includes(marker), "expected workspace route to include " + marker);
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

test("canonical portfolio population creates durable source-linked records", async () => {
  const source = await read("src/routes/workspace.tsx");
  const { PORTFOLIO_PROJECTS, PORTFOLIO_TASKS } = await import("../src/lib/portfolio-seed.ts");
  assert.match(source, /PORTFOLIO_PROJECTS/);
  assert.match(source, /PORTFOLIO_TASKS/);
  assert.match(source, /async function populatePortfolio\(\)/);
  assert.match(source, /Populate your real portfolio/);
  assert.match(source, /for \(const seed of PORTFOLIO_PROJECTS\)/);
  assert.match(source, /for \(const seed of PORTFOLIO_TASKS\)/);
  assert.match(source, /createTaskoraProject\(\{ data:/);
  assert.match(source, /createTaskoraTask\(\{ data:/);
  assert.match(source, /requestId: seed\.requestId/);
  assert.match(source, /dueDate: null/);
  assert.match(source, /schedule: null/);
  assert.match(source, /assigneeIds: \[actorUserId\]/);
  assert.match(source, /stable request keys/);
  assert.doesNotMatch(source, /localStorage|@\/lib\/store|useApp\(/);
  assert.equal(PORTFOLIO_PROJECTS.length, 15);
  assert.equal(PORTFOLIO_TASKS.length, 65);
  assert.equal(new Set(PORTFOLIO_PROJECTS.map((project) => project.requestId)).size, 15);
  assert.equal(new Set(PORTFOLIO_TASKS.map((task) => task.requestId)).size, 65);
});

test("server-backed task detail editor exposes supported fields with version checks", async () => {
  const source = await read("src/routes/workspace.tsx");
  for (const marker of [
    "function beginEditTask(task: DomainTask)",
    "async function saveTaskDetails(task: DomainTask)",
    "title: editDraft.title.trim()",
    "description: editDraft.description",
    "dueDate: editDraft.dueDate || null",
    "schedule: scheduleResult.schedule",
    'editAssignment === "self"',
    'editAssignment === "unassigned"',
    "Assign to me",
    "Save details",
  ]) assert.ok(source.includes(marker), "missing task detail edit capability: " + marker);
  assert.match(source, /expectedVersion:\s*task\.version/);
  assert.match(source, /toDateTimeLocalInZone\(task\.schedule\.startsAt, timeZone\)/);
  assert.match(source, /toDateTimeLocalInZone\(task\.schedule\.endsAt, timeZone\)/);
});

test("portfolio population is additive and never rewrites existing task edits", async () => {
  const source = await read("src/routes/workspace.tsx");
  const start = source.indexOf("async function populatePortfolio()");
  const end = source.indexOf("\n  function beginEditTask(", start);
  assert.ok(start >= 0 && end > start, "portfolio population function must exist");
  const population = source.slice(start, end);
  assert.match(population, /requestId: seed\.requestId/);
  assert.match(population, /createTaskoraTask/);
  assert.match(population, /dueDate: null/);
  assert.match(population, /schedule: null/);
  assert.match(population, /assigneeIds: \[actorUserId\]/);
  assert.doesNotMatch(population, /updateTaskoraTask|getTaskoraTask/);
  assert.match(population, /Successfully created records remain saved/);
});

test("team capabilities remain gated until membership and isolation checks pass", async () => {
  const { PORTFOLIO_TASKS } = await import("../src/lib/portfolio-seed.ts");
  const teamTask = PORTFOLIO_TASKS.find((task) => task.id === "taskora-team-roles");
  assert.ok(teamTask, "canonical portfolio must include the team/membership gate");
  assert.match(teamTask.title, /membership|invitation/i);
  assert.match(teamTask.description, /cross-workspace|two-account|team/i);
  assert.equal(teamTask.status, "todo");
});
