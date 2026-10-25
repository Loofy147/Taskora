export type DbSource = "postgres" | "pglite" | "unconfigured";

export interface DatabaseRuntimeInput {
  databaseUrl?: string;
  isVercelRuntime: boolean;
}

/**
 * PGlite is an embedded development/test database, not a durable Vercel database.
 * Vercel must use a configured PostgreSQL connection or fail with a setup error.
 */
export function resolveDbSource(input: DatabaseRuntimeInput): DbSource {
  if (typeof input.databaseUrl === "string" && input.databaseUrl.trim().length > 0) {
    return "postgres";
  }
  return input.isVercelRuntime ? "unconfigured" : "pglite";
}

export interface RuntimeAuthInput {
  authFlag?: string;
  isVercelRuntime: boolean;
  databaseUrl?: string;
  betterAuthUrl?: string;
  betterAuthSecret?: string;
  grokAuthIssuer?: string;
  grokAuthClientId?: string;
  grokAuthClientSecret?: string;
}

/** Keep the local prewired preview behavior; deployments require explicit opt-in. */
export function isRuntimeAuthEnabled(input: Pick<RuntimeAuthInput, "authFlag" | "isVercelRuntime">): boolean {
  const flag = input.authFlag?.trim().toLowerCase();
  if (flag === "false") return false;
  if (input.isVercelRuntime) return flag === "true";
  return flag !== "false";
}

/**
 * Production authentication must never silently use preview OAuth credentials
 * or an embedded/ephemeral database. Missing configuration is a closed gate.
 */
export function isRuntimeAuthConfigured(input: RuntimeAuthInput): boolean {
  if (!isRuntimeAuthEnabled(input)) return false;
  if (!input.isVercelRuntime) return true;

  return [
    input.databaseUrl,
    input.betterAuthUrl,
    input.betterAuthSecret,
    input.grokAuthIssuer,
    input.grokAuthClientId,
    input.grokAuthClientSecret,
  ].every((value) => typeof value === "string" && value.trim().length > 0);
}

export class DatabaseNotConfiguredError extends Error {
  readonly status = 503;
  readonly code = "DATABASE_NOT_CONFIGURED";

  constructor() {
    super(
      "Durable PostgreSQL is not configured for this Vercel deployment. Connect a PostgreSQL provider and set DATABASE_URL. PGlite is reserved for local development and isolated tests.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}
