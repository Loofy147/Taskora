import { createServerFn } from "@tanstack/react-start";
import {
  ArchiveTaskInputSchema,
  CreatePersonalWorkspaceInputSchema,
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  GetTaskInputSchema,
  ListTasksInputSchema,
  UpdateTaskInputSchema,
  WorkspaceScopeSchema,
} from "./domain-contracts.ts";
import { authMiddleware } from "./auth/middleware";
import {
  archiveTask,
  createProject,
  createTask,
  getOrCreatePersonalWorkspace,
  getTask,
  listProjects,
  listTasks,
  updateTask,
} from "./taskora-domain.server";


/** Create the caller's canonical personal workspace explicitly; no client ID is accepted. */
export const createOrGetTaskoraPersonalWorkspace = createServerFn({ method: "POST" })
  .validator(CreatePersonalWorkspaceInputSchema)
  .middleware([authMiddleware])
  .handler(({ context }) => getOrCreatePersonalWorkspace(context.userId));

/** The request's actor identity is derived from verified auth middleware, never request data. */
export const listTaskoraProjects = createServerFn({ method: "GET" })
  .validator(WorkspaceScopeSchema)
  .middleware([authMiddleware])
  .handler(({ context, data }) => listProjects(context.userId, data.workspaceId));

export const createTaskoraProject = createServerFn({ method: "POST" })
  .validator(CreateProjectInputSchema)
  .middleware([authMiddleware])
  .handler(({ context, data }) => createProject(context.userId, data));

export const listTaskoraTasks = createServerFn({ method: "GET" })
  .validator(ListTasksInputSchema)
  .middleware([authMiddleware])
  .handler(({ context, data }) => listTasks(context.userId, data));

export const getTaskoraTask = createServerFn({ method: "GET" })
  .validator(GetTaskInputSchema)
  .middleware([authMiddleware])
  .handler(({ context, data }) => getTask(context.userId, data));

export const createTaskoraTask = createServerFn({ method: "POST" })
  .validator(CreateTaskInputSchema)
  .middleware([authMiddleware])
  .handler(({ context, data }) => createTask(context.userId, data));

export const updateTaskoraTask = createServerFn({ method: "POST" })
  .validator(UpdateTaskInputSchema)
  .middleware([authMiddleware])
  .handler(({ context, data }) => updateTask(context.userId, data.taskId ?? "", data));

export const archiveTaskoraTask = createServerFn({ method: "POST" })
  .validator(ArchiveTaskInputSchema)
  .middleware([authMiddleware])
  .handler(({ context, data }) => archiveTask(context.userId, data));
