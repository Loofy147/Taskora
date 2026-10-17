import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AUTH_MIGRATION = "0001_auth.sql";

function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Prepare Better Auth's schema for the existing non-recursive migration runners.
 * The canonical SQL stays in migrations/auth/. An auth-on run gets an identical
 * root copy. Schema drift is fatal: never silently overwrite a modified copy.
 */
export function prepareAuthMigration(root, authEnabled) {
  if (!authEnabled) return { status: "disabled" };

  const sourcePath = join(root, "migrations", "auth", AUTH_MIGRATION);
  const targetPath = join(root, "migrations", AUTH_MIGRATION);
  const source = readOptional(sourcePath);
  if (source === null) {
    throw new Error(`Canonical auth schema is missing: ${sourcePath}`);
  }

  const existing = readOptional(targetPath);
  if (existing !== null) {
    if (existing !== source) {
      throw new Error(
        `Generated auth migration differs from the canonical auth schema: ${targetPath}. ` +
          "Restore the generated file from migrations/auth/0001_auth.sql; do not edit the copy.",
      );
    }
    return { status: "already-present" };
  }

  try {
    writeFileSync(targetPath, source, { encoding: "utf8", flag: "wx" });
    return { status: "copied" };
  } catch (error) {
    // Multiple dev/build processes may race. Accept only an identical winner.
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      if (readOptional(targetPath) === source) return { status: "already-present" };
      throw new Error(
        `Generated auth migration differs from the canonical auth schema after concurrent preparation: ${targetPath}`,
      );
    }
    throw error;
  }
}
