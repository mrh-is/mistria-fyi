import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { celebrateProgress } from "#lib/controllers/celebration.js";
import { showUndoToast } from "#lib/effects/undo-toast.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

import { createCheckOff, createRowCheckOff } from "./check-off.svelte.js";

import type { VisibilityCondition } from "#lib/types/visibility.js";

vi.mock("#lib/controllers/celebration.js", () => ({
  celebrateProgress: vi.fn((_category: string, action: () => unknown) => action()),
}));
vi.mock("#lib/stores/user-state.svelte.js", () => ({
  userState: {
    progressionState: {},
    recordInferred: (record: () => void) => {
      record();
    },
    state: { progress: {} },
  },
}));
vi.mock("#lib/effects/undo-toast.js", () => ({ showUndoToast: vi.fn() }));
// A condition is visible once it's in `revealed`; no condition is always visible.
const revealed = new Set<unknown>();
vi.mock("#lib/engine/visibility.js", () => ({
  isConditionVisible: (condition: unknown) => condition === undefined || revealed.has(condition),
  planConditionMutations: () => [],
}));

const hidden = { type: "hasUpperFloor" } as unknown as VisibilityCondition;

function setup(options: { animateLeaving?: boolean } = {}) {
  const done = new Set<string>();
  const hold = vi.fn();
  const toggle = vi.fn((id: string) => {
    if (!done.delete(id)) done.add(id);
  });
  const checkOff = createCheckOff<string, string>({
    ...options,
    category: "museum",
    grouping: { hold },
    isCompleted: (id) => done.has(id),
    toggle,
  });
  return { checkOff, done, hold, toggle };
}

const row = { id: "a", name: "Apple", sectionKey: "s", visibility: undefined };
const spoilered = { ...row, visibility: hidden };

describe("createCheckOff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    revealed.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the section, toggles, toasts with undo, and marks the row leaving", () => {
    const { checkOff, hold, toggle } = setup();
    checkOff.onToggle(row, false);

    expect(hold).toHaveBeenCalledWith("s");
    expect(toggle).toHaveBeenCalledWith("a");
    expect(showUndoToast).toHaveBeenCalledWith("Apple", true, expect.any(Function));
    expect(checkOff.isLeaving("a")).toBe(true);
    vi.advanceTimersByTime(ROW_LEAVE_MS);
    expect(checkOff.isLeaving("a")).toBe(false);
  });

  it("passes every section check to the celebration", () => {
    const { checkOff } = setup();
    const checks = [() => false, () => true];
    checkOff.onToggle({ ...row, sectionChecks: checks }, false);

    expect(celebrateProgress).toHaveBeenCalledWith("museum", expect.any(Function), checks);
  });

  it("undoes a completed row without leaving state or a second toast", () => {
    const { checkOff, done, toggle } = setup();
    checkOff.onToggle(row, false);
    vi.mocked(showUndoToast).mock.calls[0][2]();

    expect(toggle).toHaveBeenCalledTimes(2);
    expect(done.has("a")).toBe(false);
    expect(showUndoToast).toHaveBeenCalledTimes(1);
  });

  it("does not mark a row leaving when the toggle unchecks it", () => {
    const { checkOff, done } = setup();
    done.add("a");
    checkOff.onToggle(row, false);

    expect(showUndoToast).toHaveBeenCalledWith("Apple", false, expect.any(Function));
    expect(checkOff.isLeaving("a")).toBe(false);
  });

  it("never marks a row leaving when the page turns the animation off", () => {
    const { checkOff } = setup({ animateLeaving: false });
    checkOff.onToggle(row, false);

    expect(checkOff.isLeaving("a")).toBe(false);
  });

  it("holds a spoilered check-off behind the guard until it proceeds", () => {
    const { checkOff, toggle } = setup();
    checkOff.onToggle(spoilered, false);

    expect(toggle).not.toHaveBeenCalled();
    expect(checkOff.guard.open).toBe(true);
    expect(checkOff.guard.condition).toBe(hidden);
    expect(checkOff.guard.subject).toEqual({ name: "Apple" });

    checkOff.guard.proceed();
    expect(toggle).toHaveBeenCalledWith("a");
    expect(showUndoToast).toHaveBeenCalledTimes(1);
  });

  it("runs the check-off after the player records the prerequisites", () => {
    const { checkOff, toggle } = setup();
    checkOff.onToggle(spoilered, false);
    checkOff.guard.proceedAndRecordPrerequisites();

    expect(toggle).toHaveBeenCalledWith("a");
    expect(checkOff.isLeaving("a")).toBe(true);
  });

  it("leaves progress, toast, and leaving state alone when the guard is cancelled", () => {
    const { checkOff, hold, toggle } = setup();
    checkOff.onToggle(spoilered, false);
    checkOff.guard.cancel();

    expect(checkOff.guard.open).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
    expect(showUndoToast).not.toHaveBeenCalled();
    expect(checkOff.isLeaving("a")).toBe(false);
  });

  it("keeps the name out of the dialog while the row is covered", () => {
    const { checkOff } = setup();
    checkOff.onToggle(spoilered, true);

    expect(checkOff.guard.subject).toBeUndefined();
  });

  it("skips the guard when a spoilered row is already complete", () => {
    const { checkOff, done, toggle } = setup();
    done.add("a");
    checkOff.onToggle(spoilered, false);

    expect(checkOff.guard.open).toBe(false);
    expect(toggle).toHaveBeenCalledWith("a");
  });

  it("skips the guard once the condition is revealed", () => {
    revealed.add(hidden);
    const { checkOff, toggle } = setup();
    checkOff.onToggle(spoilered, false);

    expect(checkOff.guard.open).toBe(false);
    expect(toggle).toHaveBeenCalledWith("a");
  });

  it("uses a guard the page passes in", () => {
    const { checkOff: first } = setup();
    const shared = first.guard;
    const checkOff = createCheckOff<string, string>({
      category: "mines",
      grouping: { hold: vi.fn() },
      guard: shared,
      isCompleted: () => false,
      toggle: vi.fn(),
    });

    expect(checkOff.guard).toBe(shared);
  });

  it("derives a row's display from completion, spoilers, and leaving", () => {
    const { checkOff, done } = setup();

    expect(checkOff.rowDisplay("a", undefined)).toEqual({ dimmed: false, mode: "incomplete" });
    expect(checkOff.rowDisplay("a", hidden)).toEqual({ mode: "spoilered" });
    checkOff.onToggle(row, false);
    expect(done.has("a")).toBe(true);
    expect(checkOff.rowDisplay("a", undefined)).toEqual({ leaving: true, mode: "completed" });
  });
});

describe("createRowCheckOff", () => {
  it.each([false, true])("waits for confirmation and uses the finish result (%s)", (completed) => {
    vi.useFakeTimers();
    try {
      const checkOff = createRowCheckOff<string>();
      const order: string[] = [];
      const result = { undo: vi.fn() };
      const finish = vi.fn(() => {
        order.push("finish");
        return completed;
      });

      checkOff.run({
        category: "quests",
        covered: true,
        finish,
        hold: () => {
          order.push("hold");
          return [];
        },
        id: "quest",
        name: "Quest",
        needsGuard: true,
        toggle: () => {
          order.push("toggle");
          return result;
        },
        visibility: hidden,
      });

      expect(checkOff.guard.open).toBe(true);
      expect(order).toEqual([]);
      expect(checkOff.isLeaving("quest")).toBe(false);

      checkOff.guard.proceed();

      expect(order).toEqual(["hold", "toggle", "finish"]);
      expect(finish).toHaveBeenCalledExactlyOnceWith(result);
      expect(checkOff.isLeaving("quest")).toBe(completed);
      vi.advanceTimersByTime(ROW_LEAVE_MS);
      expect(checkOff.isLeaving("quest")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
