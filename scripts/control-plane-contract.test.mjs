import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeReadOnlyControlAction,
  normalizeReadOnlyControlObservation,
  READ_ONLY_CONTROL_ACTIONS,
} from "../src/lib/control-plane/read-only-contract.ts";

const observedAt = "2026-10-20T18:00:00.000Z";
const sample = (overrides = {}) => ({
  projectId: "prj_taskora",
  deploymentId: "dpl_taskora_preview",
  environment: "preview",
  deploymentUrl: "https://taskora-preview.vercel.app",
  branch: "feat/taskora-server-backed-workspace",
  commitSha: "A".repeat(40),
  deploymentState: "READY",
  observedAt,
  checks: {
    state: "success",
    observedAt,
    url: "https://github.com/Loofy147/Taskora/actions",
  },
  runtimeErrors: {
    count: 0,
    windowStart: "2026-10-20T17:00:00.000Z",
    windowEnd: "2026-10-20T17:59:00.000Z",
    queriedAt: observedAt,
  },
  providerToken: "must-never-leak",
  privateKey: "must-never-leak",
  ...overrides,
});

test("status responses copy only the versioned, allow-listed, client-safe fields", () => {
  const result = normalizeReadOnlyControlObservation(sample(), {
    nowMs: Date.parse("2026-10-20T18:01:00.000Z"),
  });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.freshness, "fresh");
  assert.equal(result.target.provider, "vercel");
  assert.equal(result.target.commitSha, "a".repeat(40));
  assert.equal(result.deployment.state, "ready");
  assert.equal(result.checks.state, "success");
  assert.deepEqual(result.runtimeErrors && result.runtimeErrors.count, 0);
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /providerToken|privateKey|must-never-leak/);
});

test("stale, future and invalid observation times are explicitly distinguished", () => {
  const nowMs = Date.parse("2026-10-20T18:10:00.000Z");
  assert.equal(normalizeReadOnlyControlObservation(sample(), { nowMs }).freshness, "stale");
  assert.equal(
    normalizeReadOnlyControlObservation(sample({ observedAt: "2026-10-20T18:20:00.000Z" }), { nowMs }).freshness,
    "future",
  );
  const invalid = normalizeReadOnlyControlObservation(sample({ observedAt: "not-a-time" }), { nowMs });
  assert.equal(invalid.freshness, "unknown");
  assert.equal(invalid.observedAt, null);
});

test("invalid targets fail closed and reject non-HTTPS URLs", () => {
  assert.throws(() => normalizeReadOnlyControlObservation(sample({ projectId: " " })), /invalid project/);
  assert.throws(() => normalizeReadOnlyControlObservation(sample({ environment: "development" })), /invalid project/);
  assert.throws(() => normalizeReadOnlyControlObservation(sample({ deploymentUrl: "http://localhost" })), /invalid project/);
  assert.throws(() => normalizeReadOnlyControlObservation(sample({ deploymentUrl: "https://user:pass@host.example" })), /invalid project/);
});

test("unknown provider status is never upgraded to a healthy state", () => {
  const result = normalizeReadOnlyControlObservation(
    sample({
      deploymentState: "mystery",
      checks: { state: "maybe", observedAt: "broken", url: "javascript:alert(1)" },
      runtimeErrors: { count: -1, windowStart: observedAt, windowEnd: observedAt, queriedAt: observedAt },
    }),
    { nowMs: Date.parse("2026-10-20T18:01:00.000Z") },
  );
  assert.equal(result.deployment.state, "unknown");
  assert.equal(result.checks.state, "unknown");
  assert.equal(result.checks.observedAt, null);
  assert.equal(result.checks.url, null);
  assert.equal(result.runtimeErrors, null);
});

test("malformed or reversed runtime-error windows are not emitted as evidence", () => {
  const reversed = normalizeReadOnlyControlObservation(
    sample({
      runtimeErrors: {
        count: 3,
        windowStart: "2026-10-20T18:05:00.000Z",
        windowEnd: "2026-10-20T18:00:00.000Z",
        queriedAt: "2026-10-20T18:06:00.000Z",
      },
    }),
  );
  assert.equal(reversed.runtimeErrors, null);
});

test("read-only actions have a small explicit allow-list", () => {
  assert.deepEqual(READ_ONLY_CONTROL_ACTIONS, [
    "status.read",
    "deployment.read",
    "checks.read",
    "runtime-errors.read",
  ]);
  assert.equal(authorizeReadOnlyControlAction({
    enabled: true,
    session: { actorId: "operator-1", operatorAllowed: true },
    action: "status.read",
  }).allowed, true);
  for (const action of ["deployment.promote", "deployment.rollback", "env.write", "https://attacker.example"]) {
    assert.deepEqual(
      authorizeReadOnlyControlAction({
        enabled: true,
        session: { actorId: "operator-1", operatorAllowed: true },
        action,
      }),
      { allowed: false, reason: "action_not_allowlisted" },
    );
  }
});

test("disabled, anonymous and non-operator requests are denied", () => {
  const operator = { actorId: "operator-1", operatorAllowed: true };
  assert.deepEqual(
    authorizeReadOnlyControlAction({ enabled: false, session: operator, action: "status.read" }),
    { allowed: false, reason: "disabled" },
  );
  assert.deepEqual(
    authorizeReadOnlyControlAction({ enabled: true, session: null, action: "status.read" }),
    { allowed: false, reason: "unauthenticated" },
  );
  assert.deepEqual(
    authorizeReadOnlyControlAction({
      enabled: true,
      session: { actorId: "customer-1", operatorAllowed: false },
      action: "status.read",
    }),
    { allowed: false, reason: "forbidden" },
  );
  assert.deepEqual(
    authorizeReadOnlyControlAction({
      enabled: true,
      session: { actorId: " ", operatorAllowed: true },
      action: "status.read",
    }),
    { allowed: false, reason: "unauthenticated" },
  );
});

test("invalid clock policy is rejected rather than silently changing freshness", () => {
  assert.throws(() => normalizeReadOnlyControlObservation(sample(), { maxAgeMs: 0 }), /maxAgeMs/);
  assert.throws(() => normalizeReadOnlyControlObservation(sample(), { maximumFutureSkewMs: -1 }), /maximumFutureSkewMs/);
});
