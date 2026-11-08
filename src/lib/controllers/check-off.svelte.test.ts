import { beforeEach, describe, expect, it, vi } from "vitest";

import { celebrateProgress } from "#lib/controllers/celebration.js";
import { showUndoToast } from "#lib/effects/undo-toast.js";

import { createCheckOff } from "./check-off.svelte.js";

import type { VisibilityCondition } from "#lib/types/visibility.js";

vi.mock("#lib/controllers/celebration.js", () => ({
  celebrateProgress: vi.fn((_category: string, action: () => void) => {
    action();
  }),
}));
vi.mock("#lib/effects/undo-toast.js", () => ({ showUndoToast: vi.fn() }));

const condition = { type: "hasUpperFloor" } as unknown as VisibilityCondition;

function setup() {
  const done = new Set<string>();
  const hold = vi.fn();
  const toggle = vi.fn((id: string) => {
    if (!done.delete(id)) done.add(id);
  });
  const checkOff = createCheckOff<string, string>({
    category: "museum",
    grouping: { hold },
    isCompleted: (id) => done.has(id),
    toggle,
  });
  return { checkOff, done, hold, toggle };
}

const row = { id: "a", name: "Apple", sectionKey: "s", spoilered: false, visibility: undefined };

describe("createCheckOff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("holds the section, toggles, toasts with undo, and marks the row leaving", () => {
    const { checkOff, hold, toggle } = setup();
    checkOff.onToggle(row, false);

    expect(hold).toHaveBeenCalledWith("s");
    expect(toggle).toHaveBeenCalledWith("a");
    expect(celebrateProgress).toHaveBeenCalledWith("museum", expect.any(Function), undefined);
    expect(showUndoToast).toHaveBeenCalledWith("Apple", true, expect.any(Function));
    expect(checkOff.leaving.has("a")).toBe(true);

    vi.mocked(showUndoToast).mock.calls[0][2]();
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("does not mark a row leaving when the toggle unchecks it", () => {
    const { checkOff, done } = setup();
    done.add("a");
    checkOff.onToggle(row, false);

    expect(showUndoToast).toHaveBeenCalledWith("Apple", false, expect.any(Function));
    expect(checkOff.leaving.has("a")).toBe(false);
  });

  it("holds a spoilered check-off behind the guard until it proceeds", () => {
    const { checkOff, toggle } = setup();
    checkOff.onToggle({ ...row, spoilered: true, visibility: condition }, false);

    expect(toggle).not.toHaveBeenCalled();
    expect(checkOff.guard.open).toBe(true);
    expect(checkOff.guard.subject).toEqual({ name: "Apple" });

    checkOff.guard.proceed();
    expect(toggle).toHaveBeenCalledWith("a");
  });

  it("keeps the name out of the dialog while the row is covered", () => {
    const { checkOff } = setup();
    checkOff.onToggle({ ...row, spoilered: true, visibility: condition }, true);

    expect(checkOff.guard.subject).toBeUndefined();
  });

  it("skips the guard when a spoilered row is already complete", () => {
    const { checkOff, done, toggle } = setup();
    done.add("a");
    checkOff.onToggle({ ...row, spoilered: true, visibility: condition }, false);

    expect(checkOff.guard.open).toBe(false);
    expect(toggle).toHaveBeenCalledWith("a");
  });
});
