import { createHash } from "node:crypto";
export { stableWorkspaceJson } from "./stable-json.ts";
import {
  MAX_WORKSPACE_BACKUP_BYTES,
  parseWorkspaceBackup,
  WORKSPACE_BACKUP_FORMAT,
  WORKSPACE_BACKUP_VERSION,
  type WorkspaceBackupData,
  type WorkspaceBackupParseResult,
} from "./workspace-backup.ts";

const MAX_USER_ID_LENGTH = 512;

/** False only for the explicit shared-demo identity mode. */
export function storageAuthModeAllowsPersistence(authEnabledFlag: string | undefined): boolean {
  return authEnabledFlag?.trim() !== "false";
}

/** Stable opaque ID for the authenticated user's personal workspace. */
export function derivePersonalWorkspaceId(userId: string): string {
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > MAX_USER_ID_LENGTH) {
    throw new TypeError("A valid authenticated user identity is required.");
  }
  const digest = createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 32);
  return `personal_${digest}`;
}

/** Normalize PostgreSQL int8 results across pg and PGlite without unsafe rounding. */
export function normalizeWorkspaceRevision(value: unknown): number {
  let revision: number;
  if (typeof value === "number") {
    revision = value;
  } else if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new TypeError("Workspace revision exceeds JavaScript's safe integer range.");
    }
    revision = Number(value);
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
    revision = Number(value);
  } else {
    throw new TypeError("Workspace revision is malformed.");
  }

  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new TypeError("Workspace revision must be a positive safe integer.");
  }
  return revision;
}

/** Validate server-bound state using the same schema and limits as JSON backups. */
export function validateWorkspaceSnapshot(data: unknown): WorkspaceBackupParseResult {
  let text: string;
  try {
    text = JSON.stringify({
      format: WORKSPACE_BACKUP_FORMAT,
      version: WORKSPACE_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    });
  } catch {
    return { ok: false, error: "Workspace data is not serializable JSON." };
  }

  if (typeof text !== "string") {
    return { ok: false, error: "Workspace data is missing or malformed." };
  }
  if (new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BACKUP_BYTES) {
    return { ok: false, error: "Workspace snapshot exceeds the 10 MB limit." };
  }
  return parseWorkspaceBackup(text);
}

export type { WorkspaceBackupData };
