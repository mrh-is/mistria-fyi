import { describe, expect, it } from "vitest";

import { deepMerge } from "./deep-partial.js";

import type { DeepPartial } from "./deep-partial.js";

describe("deepMerge", () => {
  it("returns target unchanged if source is undefined", () => {
    const target = { a: 1, b: "hello" };
    const result = deepMerge(target);

    expect(result).toEqual({ a: 1, b: "hello" });
  });

  it("shallow merges top-level primitive properties", () => {
    const target = { a: 1, b: "hello", c: true };
    const result = deepMerge(target, { b: "world" });

    expect(result).toEqual({ a: 1, b: "world", c: true });
  });

  it("deeply merges nested objects without overwriting peer properties", () => {
    const target = {
      quests: {
        crown: { id: 1 },
        fetch: { id: 2 },
      },
      version: "1.0",
    };

    const source: DeepPartial<typeof target> = {
      quests: {
        crown: { id: 99 },
      },
    };

    const result = deepMerge(target, source);

    expect(result).toEqual({
      quests: {
        crown: { id: 99 },
        fetch: { id: 2 },
      },
      version: "1.0",
    });
  });

  it("replaces arrays entirely instead of merging elements", () => {
    const target = {
      items: { tags: ["a", "b"] },
      perkTierLevels: [1, 15, 30],
    };

    const result = deepMerge(target, {
      items: { tags: ["c"] },
      perkTierLevels: [100],
    });

    expect(result).toEqual({
      items: { tags: ["c"] },
      perkTierLevels: [100],
    });
  });

  it("ignores undefined values in source to preserve target defaults", () => {
    const target = { level: 5, name: "Default" };
    const result = deepMerge(target, { level: 10, name: undefined });

    expect(result).toEqual({ level: 10, name: "Default" });
  });

  it("does not mutate the original target object", () => {
    const target = { nested: { value: 1 } };
    const result = deepMerge(target, { nested: { value: 2 } });

    expect(target.nested.value).toBe(1);
    expect(result.nested.value).toBe(2);
  });
});
