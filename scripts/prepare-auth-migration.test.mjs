import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareAuthMigration } from "./prepare-auth-migration.mjs";

function fixture(source = "CREATE TABLE auth_user (id TEXT PRIMARY KEY);\n") {
  const root = mkdtempSync(join(tmpdir(), "taskora-auth-migration-"));
  const sourcePath = join(root, "migrations", "auth", "0001_auth.sql");
  const targetPath = join(root, "migrations", "0001_auth.sql");
  mkdirSync(join(root, "migrations", "auth"), { recursive: true });
  if (source !== null) writeFileSync(sourcePath, source);
  return { root, sourcePath, targetPath, source };
}

test("auth-off mode does not copy the auth schema into the active migration directory", () => {
  const env = fixture();
  const result = prepareAuthMigration(env.root, false);
  assert.equal(result.status, "disabled");
  assert.equal(existsSync(env.targetPath), false);
});

test("auth-on mode copies the canonical schema into the migration directory", () => {
  const env = fixture();
  const result = prepareAuthMigration(env.root, true);
  assert.equal(result.status, "copied");
  assert.equal(readFileSync(env.targetPath, "utf8"), env.source);
});

test("auth-on mode is idempotent when the generated copy is already identical", () => {
  const env = fixture();
  writeFileSync(env.targetPath, env.source);
  const result = prepareAuthMigration(env.root, true);
  assert.equal(result.status, "already-present");
  assert.equal(readFileSync(env.targetPath, "utf8"), env.source);
});

test("auth-on mode fails closed when a stale copy differs from the canonical schema", () => {
  const env = fixture();
  writeFileSync(env.targetPath, "CREATE TABLE auth_user (id UUID PRIMARY KEY);\n");
  assert.throws(
    () => prepareAuthMigration(env.root, true),
    /differs from the canonical auth schema/i,
  );
  assert.equal(readFileSync(env.targetPath, "utf8"), "CREATE TABLE auth_user (id UUID PRIMARY KEY);\n");
});

test("auth-on mode fails clearly if the canonical schema is missing", () => {
  const env = fixture(null);
  assert.throws(() => prepareAuthMigration(env.root, true), /canonical auth schema is missing/i);
  assert.equal(existsSync(env.targetPath), false);
});
