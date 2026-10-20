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


export interface PostgresPoolOptions {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export interface PostgresPoolInput {
  isVercelRuntime: boolean;
  maxConnections?: string;
}

/**
 * Bound per-instance connection fan-out. Vercel instances use a small pool by
 * default because multiple warm instances share the same managed database.
 * PG_POOL_MAX may override the default, but invalid values fail early.
 */
export function resolvePostgresPoolOptions(input: PostgresPoolInput): PostgresPoolOptions {
  const raw = input.maxConnections?.trim();
  let max = input.isVercelRuntime ? 3 : 10;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
      throw new Error("PG_POOL_MAX must be an integer between 1 and 10.");
    }
    max = parsed;
  }
  return {
    max,
    idleTimeoutMillis: input.isVercelRuntime ? 10_000 : 30_000,
    connectionTimeoutMillis: 5_000,
  };
}
