import assert from "node:assert/strict";
import test from "node:test";
import {
  isRuntimeAuthConfigured,
  isRuntimeAuthEnabled,
  resolveDbSource,
} from "../src/lib/runtime-mode.ts";

test("PostgreSQL is the authoritative database whenever a connection URL is present", () => {
  assert.equal(resolveDbSource({ databaseUrl: "postgresql://example", isVercelRuntime: true }), "postgres");
  assert.equal(resolveDbSource({ databaseUrl: "  postgresql://example  ", isVercelRuntime: false }), "postgres");
});

test("PGlite remains the local/test fallback but is never selected on Vercel without PostgreSQL", () => {
  assert.equal(resolveDbSource({ databaseUrl: undefined, isVercelRuntime: false }), "pglite");
  assert.equal(resolveDbSource({ databaseUrl: "", isVercelRuntime: true }), "unconfigured");
  assert.equal(resolveDbSource({ databaseUrl: "   ", isVercelRuntime: true }), "unconfigured");
});

test("auth stays fail-closed on Vercel unless the runtime flag is explicit", () => {
  assert.equal(isRuntimeAuthEnabled({ authFlag: undefined, isVercelRuntime: true }), false);
  assert.equal(isRuntimeAuthEnabled({ authFlag: "false", isVercelRuntime: true }), false);
  assert.equal(isRuntimeAuthEnabled({ authFlag: "true", isVercelRuntime: true }), true);
  assert.equal(isRuntimeAuthEnabled({ authFlag: undefined, isVercelRuntime: false }), true);
});

test("Vercel auth is configured only when auth, durable PostgreSQL, and per-app credentials exist", () => {
  const base = {
    authFlag: "true",
    isVercelRuntime: true,
    databaseUrl: "postgresql://example",
    betterAuthUrl: "https://taskora.example",
    betterAuthSecret: "configured",
    grokAuthIssuer: "https://auth.example",
    grokAuthClientId: "client",
    grokAuthClientSecret: "configured",
  };
  assert.equal(isRuntimeAuthConfigured(base), true);
  assert.equal(isRuntimeAuthConfigured({ ...base, databaseUrl: undefined }), false);
  assert.equal(isRuntimeAuthConfigured({ ...base, grokAuthClientSecret: undefined }), false);
  assert.equal(isRuntimeAuthConfigured({ ...base, authFlag: undefined }), false);
});

test("local preview retains its prewired auth flow while explicit auth-off still disables it", () => {
  assert.equal(isRuntimeAuthConfigured({ authFlag: undefined, isVercelRuntime: false }), true);
  assert.equal(isRuntimeAuthConfigured({ authFlag: "false", isVercelRuntime: false }), false);
});
