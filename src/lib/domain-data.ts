import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ArchiveTaskInputSchema,
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  GetTaskInputSchema,
  ListTasksInputSchema,
  UpdateTaskInputSchema,
} from "./domain-contracts.ts";
import { authMiddleware } from "./auth/middleware";
import {
  archiveTask,
  createProject,
  createTask,
  getTask,
  listProjects,
  listTasks,
  updateTask,
} from "./taskora-domain.server";

const WorkspaceScopeSchema = z.object({ workspaceId: z.string().trim().min(1).max(200) }).strict();

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
