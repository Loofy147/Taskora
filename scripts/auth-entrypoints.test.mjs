import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Better Auth catch-all forwards GET and POST requests to the server handler", async () => {
  const source = await readProjectFile("src/routes/api/auth/$.ts");

  assert.match(source, /createFileRoute\(["']\/api\/auth\/\$["']\)/);
  assert.match(source, /GET:\s*\(\{\s*request\s*\}\)\s*=>\s*auth\.handler\(request\)/);
  assert.match(source, /POST:\s*\(\{\s*request\s*\}\)\s*=>\s*auth\.handler\(request\)/);
});

test("login page exposes configured providers, a disabled-auth message, and safe error feedback", async () => {
  const source = await readProjectFile("src/routes/login.tsx");

  assert.match(source, /createFileRoute\(["']\/login["']\)/);
  assert.match(source, /GROK_PROVIDERS\.map/);
  assert.match(source, /authEnabled/);
  assert.match(source, /Sign-in is disabled for this deployment/);
  assert.match(source, /role="alert"/);
  assert.match(source, /useCurrentUserState/);
});

test("generated route tree registers the login and Better Auth catch-all routes", async () => {
  const source = await readProjectFile("src/routeTree.gen.ts");

  assert.match(source, /LoginRouteImport/);
  assert.match(source, /ApiAuthSplatRouteImport/);
  assert.match(source, /'\/login'/);
  assert.match(source, /'\/api\/auth\/\$'/);
});

test("authenticated deployments show real account controls instead of the sample account menu", async () => {
  const source = await readProjectFile("src/components/shell.tsx");

  assert.match(source, /authEnabled/);
  assert.match(source, /useCurrentUserState/);
  assert.match(source, /<UserButton\s*\/>/);
  assert.match(source, /to="\/login"/);
});
