export const READ_ONLY_CONTROL_ACTIONS = [
  "status.read",
  "deployment.read",
  "checks.read",
  "runtime-errors.read",
] as const;

export type ReadOnlyControlAction = (typeof READ_ONLY_CONTROL_ACTIONS)[number];

export type ReadOnlyAccessReason =
  | "allowed"
  | "disabled"
  | "unauthenticated"
  | "forbidden"
  | "action_not_allowlisted";

export interface TrustedControlSession {
  /** Must be derived from a verified server-side session, never request JSON. */
  actorId: string;
  /** Must be derived from a server-side operator allow-list or dedicated role. */
  operatorAllowed: boolean;
}

export interface ReadOnlyAccessDecision {
  allowed: boolean;
  reason: ReadOnlyAccessReason;
}

export interface ReadOnlyControlSnapshot {
  schemaVersion: 1;
  observedAt: string | null;
  freshness: "fresh" | "stale" | "future" | "unknown";
  target: {
    provider: "vercel";
    projectId: string;
    deploymentId: string;
    environment: "production" | "preview";
    deploymentUrl: string;
    branch: string | null;
    commitSha: string | null;
  };
  deployment: {
    state: "ready" | "building" | "queued" | "initializing" | "error" | "canceled" | "blocked" | "unknown";
  };
  checks: {
    state: "success" | "failure" | "pending" | "running" | "unknown";
    observedAt: string | null;
    url: string | null;
  };
  runtimeErrors: {
    count: number;
    windowStart: string;
    windowEnd: string;
    queriedAt: string;
  } | null;
}

export interface NormalizeReadOnlyObservationOptions {
  nowMs?: number;
  maxAgeMs?: number;
  maximumFutureSkewMs?: number;
}

const DEPLOYMENT_STATES = [
  "ready",
  "building",
  "queued",
  "initializing",
  "error",
  "canceled",
  "blocked",
] as const;
const CHECK_STATES = ["success", "failure", "pending", "running"] as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseIsoTimestamp(value: unknown): { iso: string; milliseconds: number } | null {
  if (
    typeof value !== "string" ||
    !/[Tt]/.test(value) ||
    !/(?:[Zz]|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
}

function secureHttpsUrl(value: unknown): string | null {
  const candidate = nonEmptyString(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function enumValue<T extends string>(
  value: unknown,
  choices: readonly T[],
): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return choices.includes(normalized as T) ? (normalized as T) : null;
}

/**
 * Decide whether a request may access read-only status actions.
 *
 * Call only after the server has verified the session and derived the operator
 * allow-list result. This helper is not an authentication provider and must not
 * be passed a browser-supplied actor, role, or authorization flag.
 */
export function authorizeReadOnlyControlAction(input: {
  enabled: boolean;
  session: TrustedControlSession | null | undefined;
  action: unknown;
}): ReadOnlyAccessDecision {
  if (input.enabled !== true) return { allowed: false, reason: "disabled" };

  const actorId = nonEmptyString(input.session?.actorId);
  if (!actorId) return { allowed: false, reason: "unauthenticated" };

  if (input.session?.operatorAllowed !== true) {
    return { allowed: false, reason: "forbidden" };
  }

  if (
    typeof input.action !== "string" ||
    !READ_ONLY_CONTROL_ACTIONS.some((allowedAction) => allowedAction === input.action)
  ) {
    return { allowed: false, reason: "action_not_allowlisted" };
  }

  return { allowed: true, reason: "allowed" };
}

/**
 * Convert provider observations to a deliberately narrow client-safe shape.
 * Only allow-listed fields are copied: extra provider properties (including
 * token/secret fields) are dropped instead of being forwarded to the browser.
 * This is contract groundwork; it does not perform provider API calls.
 */
export function normalizeReadOnlyControlObservation(
  raw: unknown,
  options: NormalizeReadOnlyObservationOptions = {},
): ReadOnlyControlSnapshot {
  const input = asRecord(raw);
  if (!input) throw new Error("Control observation must be an object.");

  const projectId = nonEmptyString(input.projectId);
  const deploymentId = nonEmptyString(input.deploymentId);
  const environment = enumValue(input.environment, ["production", "preview"] as const);
  const deploymentUrl = secureHttpsUrl(input.deploymentUrl);

  if (!projectId || !deploymentId || !environment || !deploymentUrl) {
    throw new Error("Control observation has an invalid project, deployment, environment, or HTTPS URL.");
  }

  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;
  const maximumFutureSkewMs = options.maximumFutureSkewMs ?? 30 * 1000;
  if (!Number.isFinite(nowMs)) throw new RangeError("nowMs must be finite.");
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1) throw new RangeError("maxAgeMs must be a positive integer.");
  if (!Number.isInteger(maximumFutureSkewMs) || maximumFutureSkewMs < 0) {
    throw new RangeError("maximumFutureSkewMs must be a non-negative integer.");
  }

  const observationTime = parseIsoTimestamp(input.observedAt);
  let freshness: ReadOnlyControlSnapshot["freshness"] = "unknown";
  if (observationTime) {
    if (observationTime.milliseconds > nowMs + maximumFutureSkewMs) {
      freshness = "future";
    } else if (nowMs - observationTime.milliseconds > maxAgeMs) {
      freshness = "stale";
    } else {
      freshness = "fresh";
    }
  }

  const branch = nonEmptyString(input.branch);
  const rawSha = nonEmptyString(input.commitSha);
  const commitSha = rawSha && /^[0-9a-f]{40}$/i.test(rawSha) ? rawSha.toLowerCase() : null;

  const checkInput = asRecord(input.checks);
  const checkTime = parseIsoTimestamp(checkInput?.observedAt);
  const checkUrl = secureHttpsUrl(checkInput?.url);
  const checkState = enumValue(checkInput?.state, CHECK_STATES);

  let runtimeErrors: ReadOnlyControlSnapshot["runtimeErrors"] = null;
  const runtimeInput = asRecord(input.runtimeErrors);
  const count = runtimeInput?.count;
  const windowStart = parseIsoTimestamp(runtimeInput?.windowStart);
  const windowEnd = parseIsoTimestamp(runtimeInput?.windowEnd);
  const queriedAt = parseIsoTimestamp(runtimeInput?.queriedAt);
  if (
    typeof count === "number" &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    windowStart &&
    windowEnd &&
    queriedAt &&
    windowStart.milliseconds <= windowEnd.milliseconds &&
    windowEnd.milliseconds <= queriedAt.milliseconds
  ) {
    runtimeErrors = {
      count,
      windowStart: windowStart.iso,
      windowEnd: windowEnd.iso,
      queriedAt: queriedAt.iso,
    };
  }

  return {
    schemaVersion: 1,
    observedAt: observationTime?.iso ?? null,
    freshness,
    target: {
      provider: "vercel",
      projectId,
      deploymentId,
      environment,
      deploymentUrl,
      branch,
      commitSha,
    },
    deployment: {
      state: enumValue(input.deploymentState, DEPLOYMENT_STATES) ?? "unknown",
    },
    checks: {
      state: checkState ?? "unknown",
      observedAt: checkTime?.iso ?? null,
      url: checkUrl,
    },
    runtimeErrors,
  };
}
