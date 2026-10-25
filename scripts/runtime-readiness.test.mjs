import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRuntimeReadiness } from "../src/lib/runtime-readiness.ts";

const checkedAt = "2026-10-25T17:00:00.000Z";

test("liveness stays OK while unconfigured dependencies block readiness", () => {
  const report = buildRuntimeReadiness({
    database: "not_configured",
    authentication: "not_configured",
    checkedAt,
  });

  assert.equal(report.status, "ok");
  assert.equal(report.readiness, "blocked");
  assert.deepEqual(report.checks, {
    database: "not_configured",
    authentication: "not_configured",
  });
  assert.equal(report.checkedAt, checkedAt);
});

test("ready requires reachable PostgreSQL and configured authentication", () => {
  const report = buildRuntimeReadiness({
    database: "ready",
    authentication: "configured",
    checkedAt,
  });
  assert.equal(report.readiness, "ready");
});

test("database connectivity alone does not pass readiness", () => {
  const report = buildRuntimeReadiness({
    database: "ready",
    authentication: "not_configured",
    checkedAt,
  });
  assert.equal(report.readiness, "blocked");
});

test("embedded PGlite does not count as durable deployment readiness", () => {
  const report = buildRuntimeReadiness({
    database: "development_only",
    authentication: "configured",
    checkedAt,
  });
  assert.equal(report.status, "ok");
  assert.equal(report.readiness, "blocked");
});

test("database failure is represented by a coarse state, not diagnostics", () => {
  const report = buildRuntimeReadiness({
    database: "unavailable",
    authentication: "not_configured",
    checkedAt,
  });
  const json = JSON.stringify(report);
  assert.equal(report.readiness, "blocked");
  for (const forbidden of ["password", "secret", "postgresql://", "ECONNREFUSED", "stack"]) {
    assert.equal(json.includes(forbidden), false);
  }
});
