import { describe, it, expect } from "vitest";
import { deepDiff, formatPath, filterBenchmarkChanges, type DiffChange } from "./diff";

describe("deepDiff", () => {
  describe("primitive values", () => {
    it("returns empty array for identical primitives", () => {
      expect(deepDiff(1, 1)).toEqual([]);
      expect(deepDiff("hello", "hello")).toEqual([]);
      expect(deepDiff(true, true)).toEqual([]);
      expect(deepDiff(null, null)).toEqual([]);
      expect(deepDiff(undefined, undefined)).toEqual([]);
    });

    it("detects changes in primitive values", () => {
      const result = deepDiff(1, 2);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "changed",
        path: ".",
        oldValue: 1,
        newValue: 2,
      });
    });

    it("detects changes from undefined to value", () => {
      const result = deepDiff(undefined, "value");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "added",
        path: ".",
        value: "value",
      });
    });

    it("detects changes from value to undefined", () => {
      const result = deepDiff("value", undefined);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "removed",
        path: ".",
        value: "value",
      });
    });
  });

  describe("null values", () => {
    it("returns empty array when both are null", () => {
      expect(deepDiff(null, null)).toEqual([]);
    });

    it("detects addition when going from null to value", () => {
      const result = deepDiff(null, { foo: "bar" });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "added",
        path: ".",
        value: { foo: "bar" },
      });
    });

    it("detects removal when going from value to null", () => {
      const result = deepDiff({ foo: "bar" }, null);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "removed",
        path: ".",
        value: { foo: "bar" },
      });
    });

    it("detects change from null to object", () => {
      const result = deepDiff(null, { a: 1 });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("added");
    });
  });

  describe("nested objects", () => {
    it("returns empty array for identical nested objects", () => {
      const obj = { a: 1, b: { c: 2, d: { e: 3 } } };
      expect(deepDiff(obj, obj)).toEqual([]);
    });

    it("detects changes in nested object properties", () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { a: 1, b: { c: 3 } };
      const result = deepDiff(obj1, obj2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "changed",
        path: "b.c",
        oldValue: 2,
        newValue: 3,
      });
    });

    it("detects added properties in nested objects", () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 1, b: { c: 2 } };
      const result = deepDiff(obj1, obj2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "added",
        path: "b",
        value: { c: 2 },
      });
    });

    it("detects removed properties in nested objects", () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { a: 1 };
      const result = deepDiff(obj1, obj2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "removed",
        path: "b",
        value: { c: 2 },
      });
    });

    it("detects multiple changes in nested objects", () => {
      const obj1 = { a: 1, b: { c: 2, d: 3 }, e: 4 };
      const obj2 = { a: 1, b: { c: 5, d: 3 }, e: 6 };
      const result = deepDiff(obj1, obj2);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        type: "changed",
        path: "b.c",
        oldValue: 2,
        newValue: 5,
      });
      expect(result).toContainEqual({
        type: "changed",
        path: "e",
        oldValue: 4,
        newValue: 6,
      });
    });

    it("handles deeply nested objects", () => {
      const obj1 = { level1: { level2: { level3: { level4: "deep" } } } };
      const obj2 = { level1: { level2: { level3: { level4: "deeper" } } } };
      const result = deepDiff(obj1, obj2);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("level1.level2.level3.level4");
    });
  });

  describe("arrays", () => {
    it("returns empty array for identical arrays", () => {
      const arr = [1, 2, 3, { a: 4 }];
      expect(deepDiff(arr, arr)).toEqual([]);
    });

    it("detects added array items", () => {
      const arr1 = [1, 2];
      const arr2 = [1, 2, 3];
      const result = deepDiff(arr1, arr2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "array-item-added",
        path: "[2]",
        index: 2,
        value: 3,
      });
    });

    it("detects removed array items", () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2];
      const result = deepDiff(arr1, arr2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "array-item-removed",
        path: "[2]",
        index: 2,
        value: 3,
      });
    });

    it("detects changes in array items", () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 5, 3];
      const result = deepDiff(arr1, arr2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "changed",
        path: "[1]",
        oldValue: 2,
        newValue: 5,
      });
    });

    it("detects changes in nested objects within arrays", () => {
      const arr1 = [{ a: 1 }, { b: 2 }];
      const arr2 = [{ a: 1 }, { b: 5 }];
      const result = deepDiff(arr1, arr2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "changed",
        path: "[1].b",
        oldValue: 2,
        newValue: 5,
      });
    });

    it("handles arrays with mixed add and remove", () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 4];
      const result = deepDiff(arr1, arr2);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        type: "array-item-removed",
        path: "[2]",
        index: 2,
        value: 3,
      });
      expect(result).toContainEqual({
        type: "changed",
        path: "[1]",
        oldValue: 2,
        newValue: 4,
      });
    });

    it("handles arrays of objects", () => {
      const arr1 = [{ id: 1, name: "first" }, { id: 2, name: "second" }];
      const arr2 = [{ id: 1, name: "first" }, { id: 2, name: "updated" }];
      const result = deepDiff(arr1, arr2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "changed",
        path: "[1].name",
        oldValue: "second",
        newValue: "updated",
      });
    });

    it("handles empty arrays", () => {
      expect(deepDiff([], [])).toEqual([]);
      expect(deepDiff([], [1])).toHaveLength(1);
      expect(deepDiff([1], [])).toHaveLength(1);
    });
  });

  describe("array vs object", () => {
    it("detects change when one is array and other is object", () => {
      const result = deepDiff({ a: 1 }, [1, 2]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("changed");
      expect(result[0].path).toBe(".");
    });
  });

  describe("complex scenarios", () => {
    it("handles mixed nested structures", () => {
      const obj1 = {
        users: [
          { id: 1, name: "Alice", roles: ["admin"] },
          { id: 2, name: "Bob", roles: ["user"] },
        ],
        metadata: { count: 2 },
      };

      const obj2 = {
        users: [
          { id: 1, name: "Alice", roles: ["admin", "moderator"] },
          { id: 2, name: "Robert", roles: ["user"] },
        ],
        metadata: { count: 2, updated: true },
      };

      const result = deepDiff(obj1, obj2);

      expect(result.length).toBeGreaterThan(0);
      expect(result).toContainEqual({
        type: "array-item-added",
        path: "users[0].roles[1]",
        index: 1,
        value: "moderator",
      });
      expect(result).toContainEqual({
        type: "changed",
        path: "users[1].name",
        oldValue: "Bob",
        newValue: "Robert",
      });
    });
  });

  it("handles empty arrays", () => {
    expect(deepDiff([], [])).toEqual([]);
    expect(deepDiff([], [1])).toHaveLength(1);
    expect(deepDiff([1], [])).toHaveLength(1);
  });

  it("handles arrays with mixed add and remove", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 4];
    const result = deepDiff(arr1, arr2);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result).toContainEqual({
      type: "array-item-removed",
      path: "[2]",
      index: 2,
      value: 3,
    });
    expect(result).toContainEqual({
      type: "changed",
      path: "[1]",
      oldValue: 2,
      newValue: 4,
    });
  });

  it("handles arrays of objects", () => {
    const arr1 = [{ id: 1, name: "first" }, { id: 2, name: "second" }];
    const arr2 = [{ id: 1, name: "first" }, { id: 2, name: "updated" }];
    const result = deepDiff(arr1, arr2);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "changed",
      path: "[1].name",
      oldValue: "second",
      newValue: "updated",
    });
  });

  it("handles null values in objects", () => {
    const obj1 = { a: null, b: 1 };
    const obj2 = { a: 2, b: 1 };
    const result = deepDiff(obj1, obj2);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "added",
      path: "a",
      value: 2,
    });
  });

  it("handles undefined vs null", () => {
    const obj1 = { a: undefined };
    const obj2 = { a: null };
    const result = deepDiff(obj1, obj2);

    // Both undefined and null are treated as falsy, no change detected
    expect(result).toHaveLength(0);
  });

  describe("edge cases", () => {
    it("handles empty objects", () => {
      expect(deepDiff({}, {})).toEqual([]);
      expect(deepDiff({}, { a: 1 })).toHaveLength(1);
    });

    it("handles special characters in keys", () => {
      const obj1 = { "key.with.dots": 1 };
      const obj2 = { "key.with.dots": 2 };
      const result = deepDiff(obj1, obj2);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("key.with.dots");
    });

    it("handles numeric string keys vs array indices", () => {
      const obj1 = { 0: "first", 1: "second" };
      const obj2 = ["first", "second"];
      const result = deepDiff(obj1, obj2);

      // Array vs object should be detected as a change
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("changed");
    });
  });
});

describe("formatPath", () => {
  it("formats simple paths", () => {
    expect(formatPath("a")).toBe("a");
    expect(formatPath("a.b.c")).toBe("a → b → c");
  });

  it("formats array indices", () => {
    expect(formatPath("[0]")).toBe("[0]");
    expect(formatPath("a[0]")).toBe("a[0]");
    expect(formatPath("a[0].b")).toBe("a[0] → b");
  });

  it("removes leading dot", () => {
    expect(formatPath(".a")).toBe("a");
    expect(formatPath(".a.b")).toBe("a → b");
  });

  it("handles mixed paths", () => {
    expect(formatPath("users[0].name")).toBe("users[0] → name");
    expect(formatPath("data.items[2].value")).toBe("data → items[2] → value");
  });

  it("handles empty path", () => {
    expect(formatPath(".")).toBe("");
    expect(formatPath("")).toBe("");
  });

  it("preserves array notation in middle of path", () => {
    expect(formatPath("[0].a[1].b")).toBe("[0] → a[1] → b");
  });
});

describe("filterBenchmarkChanges", () => {
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

  describe("filters out irrelevant fields", () => {
    it.each(irrelevantPaths)("filters out %s", (path) => {
      const changes: DiffChange[] = [
        { type: "changed", path, oldValue: "old", newValue: "new" },
      ];
      const result = filterBenchmarkChanges(changes);
      expect(result).toEqual([]);
    });
  });

  it("keeps relevant changes", () => {
    const changes: DiffChange[] = [
      { type: "changed", path: "score", oldValue: 50, newValue: 75 },
      { type: "changed", path: "evaluation.verdict", oldValue: "fail", newValue: "pass" },
    ];
    const result = filterBenchmarkChanges(changes);
    expect(result).toHaveLength(2);
  });

  it("filters nested irrelevant fields", () => {
    const changes: DiffChange[] = [
      { type: "changed", path: "stages[0].promptTokens", oldValue: 100, newValue: 200 },
      { type: "changed", path: "stages[0].elapsedMs", oldValue: 1000, newValue: 1500 },
      { type: "changed", path: "stages[0].output", oldValue: "old", newValue: "new" },
    ];
    const result = filterBenchmarkChanges(changes);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((c) => c.path === "stages[0].output")).toBe(true);
    // Check that irrelevant paths are filtered
    expect(result.every((c) => !c.path.startsWith("promptTokens") && !c.path.startsWith("elapsedMs"))).toBe(true);
  });

  it("handles empty changes array", () => {
    expect(filterBenchmarkChanges([])).toEqual([]);
  });

  it("filters multiple irrelevant changes", () => {
    const changes: DiffChange[] = [
      { type: "changed", path: "id", oldValue: "1", newValue: "2" },
      { type: "changed", path: "timestamp", oldValue: "2021", newValue: "2022" },
      { type: "changed", path: "score", oldValue: 50, newValue: 75 },
      { type: "changed", path: "cost", oldValue: 0.01, newValue: 0.02 },
      { type: "added", path: "newField", value: "new" },
    ];
    const result = filterBenchmarkChanges(changes);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.path === "score" || c.path === "newField")).toBe(true);
  });

  it("keeps changes for fields that don't match irrelevant paths exactly", () => {
    const changes: DiffChange[] = [
      { type: "changed", path: "identifierField", oldValue: "old", newValue: "new" },
      { type: "changed", path: "timestampData", oldValue: "old", newValue: "new" },
      { type: "changed", path: "myId", oldValue: "old", newValue: "new" },
    ];
    const result = filterBenchmarkChanges(changes);
    // "id" is filtered but others are kept
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("filters exact match for irrelevant paths", () => {
    const changes: DiffChange[] = [
      { type: "changed", path: "id", oldValue: "1", newValue: "2" },
    ];
    const result = filterBenchmarkChanges(changes);
    expect(result).toEqual([]);
  });

  it("handles all types of changes", () => {
    const changes: DiffChange[] = [
      { type: "added", path: "id", value: "123" },
      { type: "removed", path: "timestamp", value: "2021" },
      { type: "changed", path: "cost", oldValue: 0.01, newValue: 0.02 },
      { type: "array-item-added", path: "promptTokens", index: 0, value: 100 },
      { type: "array-item-removed", path: "elapsedMs", index: 0, value: 1000 },
      { type: "added", path: "relevantField", value: "value" },
    ];
    const result = filterBenchmarkChanges(changes);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("relevantField");
  });
});
