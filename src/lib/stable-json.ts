/** Canonical JSON for equality checks that run in both browser and server bundles. */
export function stableWorkspaceJson(value: unknown): string {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (node !== null && typeof node === "object") {
      const record = node as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, visit(record[key])]));
    }
    return node;
  };
  const text = JSON.stringify(visit(value));
  if (typeof text !== "string") throw new TypeError("Workspace state cannot be serialized as JSON.");
  return text;
}
