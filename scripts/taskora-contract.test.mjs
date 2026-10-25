import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Taskora product contract", () => {
  it("uses the chosen Taskora brand in the wordmark and page metadata", () => {
    assert.match(read("src/components/bits.tsx"), />Taskora<\/span>/);
    assert.match(read("src/routes/__root.tsx"), /const APP_NAME = "Taskora"/);
    assert.equal(JSON.parse(read("package.json")).name, "taskora");
    assert.equal(JSON.parse(read("package-lock.json")).packages[""].name, "taskora");
  });

  it("does not expose the unverified file-reference feature as a real upload", () => {
    assert.match(read("src/components/details.tsx"), /File contents are not uploaded or shared/);
    assert.match(read("src/components/views.tsx"), /File uploads and downloads are not connected/);
  });

  it("discloses that cross-user synchronization and invitations are not implemented", () => {
    assert.match(read("src/components/board.tsx"), /shared synchronization and invitations are not connected/);
    assert.match(read("src/components/views.tsx"), /does not send an invitation/);
  });

  it("validates task dates both in the store and due-date utility", () => {
    assert.match(read("src/lib/store.ts"), /due: isDateKey\(input\.due\) \? input\.due : todayKey\(\)/);
    assert.match(read("src/lib/format.ts"), /return isDateKey\(due\) && status !== "done" && due < todayKey\(\)/);
    assert.match(read("src/components/composer.tsx"), /required type="date"/);
  });

  it("exposes validated backup/restore and requires confirmation before replacing state", () => {
    assert.match(read("src/components/views.tsx"), /Export backup/);
    assert.match(read("src/components/views.tsx"), /Backup validated — choose how to apply it/);
    assert.match(read("src/components/views.tsx"), /useApp\.persist\.hasHydrated\(\)/);
    assert.match(read("src/lib/store.ts"), /replaceWorkspaceData: \(data\) =>/);
    assert.match(read("src/lib/workspace-backup.ts"), /WORKSPACE_BACKUP_VERSION = 1/);
  });
});
