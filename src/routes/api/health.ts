import { createFileRoute } from "@tanstack/react-router";
import { authConfigured } from "@/lib/auth/server";
import { dbSource } from "@/lib/db";
import { getPostgresPool } from "@/lib/postgres-pool.server";
import {
  buildRuntimeReadiness,
  type RuntimeDatabaseState,
} from "@/lib/runtime-readiness";

async function inspectDatabase(): Promise<RuntimeDatabaseState> {
  if (dbSource === "unconfigured") return "not_configured";
  if (dbSource === "pglite") return "development_only";

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return "not_configured";

  try {
    // Read-only probe. Provider errors and connection details are never returned.
    await getPostgresPool(databaseUrl).query("SELECT 1");
    return "ready";
  } catch {
    return "unavailable";
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const database = await inspectDatabase().catch(
          () => "unavailable" as const,
        );
        const payload = buildRuntimeReadiness({
          database,
          authentication: authConfigured ? "configured" : "not_configured",
          checkedAt: new Date().toISOString(),
        });

        // HTTP 200 signals process liveness; inspect readiness for usability.
        return Response.json(payload, {
          status: 200,
          headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
