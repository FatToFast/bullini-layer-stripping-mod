/**
 * Deep diff utility for comparing benchmark drafts
 */

export type DiffChange =
  | { type: "added"; path: string; value: unknown }
  | { type: "removed"; path: string; value: unknown }
  | { type: "changed"; path: string; oldValue: unknown; newValue: unknown }
  | { type: "array-item-added"; path: string; index: number; value: unknown }
  | { type: "array-item-removed"; path: string; index: number; value: unknown };

/**
 * Compute deep differences between two objects
 */
export function deepDiff(obj1: unknown, obj2: unknown, basePath = ""): DiffChange[] {
  const changes: DiffChange[] = [];

  if (obj1 === obj2) {
    return changes;
  }

  // Handle null/undefined cases
  if (obj1 === null || obj1 === undefined) {
    if (obj2 !== null && obj2 !== undefined) {
      changes.push({ type: "added", path: basePath || ".", value: obj2 });
    }
    return changes;
  }

  if (obj2 === null || obj2 === undefined) {
    changes.push({ type: "removed", path: basePath || ".", value: obj1 });
    return changes;
  }

  // Handle primitive types
  if (typeof obj1 !== "object" || typeof obj2 !== "object") {
    if (obj1 !== obj2) {
      changes.push({ type: "changed", path: basePath || ".", oldValue: obj1, newValue: obj2 });
    }
    return changes;
  }

  // Handle arrays
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    const maxLength = Math.max(obj1.length, obj2.length);

    for (let i = 0; i < maxLength; i++) {
      const path = basePath ? `${basePath}[${i}]` : `[${i}]`;

      if (i >= obj1.length) {
        changes.push({ type: "array-item-added", path, index: i, value: obj2[i] });
      } else if (i >= obj2.length) {
        changes.push({ type: "array-item-removed", path, index: i, value: obj1[i] });
      } else {
        changes.push(...deepDiff(obj1[i], obj2[i], path));
      }
    }
    return changes;
  }

  // Handle objects
  if (Array.isArray(obj1) || Array.isArray(obj2)) {
    // One is array, one is object
    changes.push({ type: "changed", path: basePath || ".", oldValue: obj1, newValue: obj2 });
    return changes;
  }

  const keys1 = Object.keys(obj1 as Record<string, unknown>);
  const keys2 = Object.keys(obj2 as Record<string, unknown>);
  const allKeys = new Set([...keys1, ...keys2]);

  for (const key of allKeys) {
    const path = basePath ? `${basePath}.${key}` : key;

    if (!(key in obj1)) {
      changes.push({ type: "added", path, value: (obj2 as Record<string, unknown>)[key] });
    } else if (!(key in obj2)) {
      changes.push({ type: "removed", path, value: (obj1 as Record<string, unknown>)[key] });
    } else {
      changes.push(
        ...deepDiff(
          (obj1 as Record<string, unknown>)[key],
          (obj2 as Record<string, unknown>)[key],
          path,
        ),
      );
    }
  }

  return changes;
}

/**
 * Get a human-readable path for display
 */
export function formatPath(path: string): string {
  return path
    .replace(/\[(\d+)\]/g, "[$1]")
    .replace(/^\./, "")
    .split(".")
    .join(" → ");
}

/**
 * Filter changes to only show relevant fields for benchmark comparison
 */
export function filterBenchmarkChanges(changes: DiffChange[]): DiffChange[] {
  const irrelevantPaths = [
    "id",
    "timestamp",
    "storageKey",
    "runId",
    "elapsedMs",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "cost",
  ];

  return changes.filter(
    (change) =>
      !irrelevantPaths.some((prefix) =>
        change.path.startsWith(prefix) || change.path === prefix,
      ),
  );
}
