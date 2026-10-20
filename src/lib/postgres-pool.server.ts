import { Pool, types } from "pg";
import { resolvePostgresPoolOptions } from "./runtime-mode.ts";

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (value: string) => value;

// Apply the same JSON-safe row parsing for both domain queries and Better Auth.
types.setTypeParser(OID_INT8, Number);
types.setTypeParser(OID_DATE, identity);
types.setTypeParser(OID_INTERVAL, identity);

type SharedPostgresPool = InstanceType<typeof Pool>;
const globalRef = globalThis as typeof globalThis & {
  __taskoraPostgresPool__?: SharedPostgresPool;
  __taskoraPostgresPoolUrl__?: string;
};

/**
 * One bounded pool per warm process for both Better Auth and domain operations.
 * On Vercel, use a provider's pooled connection URL and a conservative default
 * maximum. Never silently switch a warm process to a different database URL.
 */
export function getPostgresPool(databaseUrl: string): SharedPostgresPool {
  const normalizedUrl = databaseUrl.trim();
  if (!normalizedUrl) throw new Error("DATABASE_URL must be non-empty.");

  const existing = globalRef.__taskoraPostgresPool__;
  if (existing) {
    if (globalRef.__taskoraPostgresPoolUrl__ !== normalizedUrl) {
      throw new Error("DATABASE_URL changed inside a warm process; restart the process before switching databases.");
    }
    return existing;
  }

  const options = resolvePostgresPoolOptions({
    isVercelRuntime: process.env.VERCEL === "1",
    maxConnections: process.env.PG_POOL_MAX,
  });
  const pool = new Pool({
    connectionString: normalizedUrl,
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    keepAlive: true,
  });
  pool.on("error", (error) => {
    // Avoid logging connection strings or query parameters.
    console.error("[taskora] idle PostgreSQL client error:", error.message);
  });

  globalRef.__taskoraPostgresPoolUrl__ = normalizedUrl;
  globalRef.__taskoraPostgresPool__ = pool;
  return pool;
}
