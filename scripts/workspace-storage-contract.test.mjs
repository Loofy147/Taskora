import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("workspace persistence security contract", () => {
  it("protects every server function with verified auth middleware", () => {
    const source = read("src/lib/workspace-data.ts");
    const middlewareCount = source.match(/\.middleware\(\[authMiddleware\]\)/g)?.length ?? 0;
    assert.equal(middlewareCount, 4);
    assert.doesNotMatch(source, /userId\s*:\s*z\./);
  });

  it("rejects cloud storage while the shared demo identity mode disables auth", () => {
    const source = read("src/lib/workspace-storage.server.ts");
    assert.match(source, /storageAuthModeAllowsPersistence\(process\.env\.VITE_AUTH_ENABLED\)/);
    assert.match(source, /WorkspaceStorageUnavailableError/);
  });

  it("uses owner-scoped membership joins for inspection and load", () => {
    const source = read("src/lib/workspace-storage.server.ts");
    assert.match(source, /m\.user_id = \$2 AND m\.role = 'owner'/);
    assert.match(source, /w\.owner_user_id = \$2 AND w\.kind = 'personal'/);
    assert.match(source, /Inspection is intentionally read-only/);
  });

  it("uses revision compare-and-swap and an atomic event insert on updates", () => {
    const source = read("src/lib/workspace-storage.server.ts");
    assert.match(source, /WHERE workspace_id = \$1 AND revision = \$2/);
    assert.match(source, /logged AS \(/);
    assert.match(source, /INSERT INTO taskora_workspace_events/);
    assert.match(source, /WorkspaceSnapshotConflictError/);
  });
});
