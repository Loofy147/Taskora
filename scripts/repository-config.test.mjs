import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("repository maintenance contract", () => {
  it("runs locked dependency installation, tests, typecheck, lint, and build in CI", () => {
    const workflow = read(".github/workflows/ci.yml");
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /branches:\s*\[main\]/);
    assert.match(workflow, /npm ci/);
    assert.match(workflow, /npm test/);
    assert.match(workflow, /npm run typecheck/);
    assert.match(workflow, /npm run lint/);
    assert.match(workflow, /npm run build/);
    assert.match(workflow, /contents:\s*read/);
    assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
    assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
  });

  it("configures Dependabot for npm dependencies and GitHub Actions", () => {
    const config = read(".github/dependabot.yml");
    assert.match(config, /package-ecosystem:\s*npm/);
    assert.match(config, /package-ecosystem:\s*github-actions/);
    assert.match(config, /interval:\s*weekly/);
  });

  it("provides bug, feature, and security reporting guidance", () => {
    assert.equal(existsSync(new URL("../.github/ISSUE_TEMPLATE/bug_report.md", import.meta.url)), true);
    assert.equal(existsSync(new URL("../.github/ISSUE_TEMPLATE/feature_request.md", import.meta.url)), true);
    assert.equal(existsSync(new URL("../.github/ISSUE_TEMPLATE/config.yml", import.meta.url)), true);
    const security = read("SECURITY.md");
    assert.match(security, /Do not disclose suspected vulnerabilities in public issues/);
    assert.match(security, /not a server-enforced workspace boundary/);
  });
});
