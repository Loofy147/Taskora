import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";
import {
  initializePersonalWorkspaceSnapshot,
  inspectPersonalWorkspace,
  loadPersonalWorkspaceSnapshot,
  savePersonalWorkspaceSnapshot,
} from "./workspace-storage.server";

const initializeInput = z.object({ data: z.unknown() });
const saveInput = z.object({
  workspaceId: z.string().min(1).max(128),
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  data: z.unknown(),
});

/** Inspect the signed-in user's personal workspace without reading its payload. */
export const inspectWorkspaceSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => inspectPersonalWorkspace(context.userId));

/** Read the current snapshot after the user explicitly chooses to load it. */
export const loadWorkspaceSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => loadPersonalWorkspaceSnapshot(context.userId));

/** Initialize a workspace exactly once; concurrent initializers cannot overwrite one another. */
export const initializeWorkspaceSnapshot = createServerFn({ method: "POST" })
  .validator(initializeInput)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) =>
    initializePersonalWorkspaceSnapshot(context.userId, data.data),
  );

/** Compare-and-swap update. Stale revisions fail with HTTP 409 instead of losing writes. */
export const saveWorkspaceSnapshot = createServerFn({ method: "POST" })
  .validator(saveInput)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) =>
    savePersonalWorkspaceSnapshot({ ...data, userId: context.userId }),
  );
