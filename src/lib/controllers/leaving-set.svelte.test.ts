import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ROW_LEAVE_DELAY_MS, ROW_LEAVE_FADE_MS, ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

import { createLeavingSet } from "./leaving-set.svelte.js";

describe("createLeavingSet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a marked id until the row leave time has elapsed", () => {
    const set = createLeavingSet<string>();
    set.markLeaving("a");

    expect(set.has("a")).toBe(true);
    expect(set.ids.has("a")).toBe(true);
    vi.advanceTimersByTime(ROW_LEAVE_MS - 1);
    expect(set.has("a")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(set.has("a")).toBe(false);
  });

  it("restarts the leaving window when the same item is completed again", () => {
    const set = createLeavingSet<string>(100);
    set.markLeaving("a");
    vi.advanceTimersByTime(50);
    set.markLeaving("a");
    vi.advanceTimersByTime(50);
    expect(set.has("a")).toBe(true);
    vi.advanceTimersByTime(50);
    expect(set.has("a")).toBe(false);
  });

  it("outlasts the row's delay plus fade", () => {
    expect(ROW_LEAVE_MS).toBeGreaterThanOrEqual(ROW_LEAVE_DELAY_MS + ROW_LEAVE_FADE_MS);
  });

  it("accepts a custom duration", () => {
    const set = createLeavingSet<number>(10);
    set.markLeaving(1);
    vi.advanceTimersByTime(10);
    expect(set.has(1)).toBe(false);
  });
});
