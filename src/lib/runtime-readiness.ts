export type RuntimeDatabaseState =
  | "ready"
  | "development_only"
  | "not_configured"
  | "unavailable";

export type RuntimeAuthenticationState = "configured" | "not_configured";

export interface RuntimeReadinessInput {
  database: RuntimeDatabaseState;
  authentication: RuntimeAuthenticationState;
  checkedAt: string;
}

export interface RuntimeReadinessPayload {
  status: "ok";
  readiness: "ready" | "blocked";
  checks: {
    database: RuntimeDatabaseState;
    authentication: RuntimeAuthenticationState;
  };
  checkedAt: string;
}

export function buildRuntimeReadiness(input: RuntimeReadinessInput): RuntimeReadinessPayload {
  const ready = input.database === "ready" && input.authentication === "configured";

  return {
    status: "ok",
    readiness: ready ? "ready" : "blocked",
    checks: {
      database: input.database,
      authentication: input.authentication,
    },
    checkedAt: input.checkedAt,
  };
}
