import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { questToastMessage, showQuestToast, showUndoToast } from "#lib/effects/undo-toast.js";
import { recordKeys } from "#lib/utils/record.js";

const dismiss = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => {
  let nextId = 0;
  return vi.fn((): string => {
    nextId += 1;
    return `toast-${nextId}`;
  });
});

vi.mock("svelte-sonner", () => ({ toast: Object.assign(toast, { dismiss }) }));

describe("showUndoToast", () => {
  beforeEach(() => {
    toast.mockClear();
    dismiss.mockClear();
  });

  it("keeps the undo action available for an extended timeout", () => {
    const onUndo = vi.fn();

    showUndoToast("Copper Sword", true, onUndo);

    expect(toast).toHaveBeenCalledWith(
      'Marked "Copper Sword" complete',
      expect.objectContaining({
        cancel: { label: "Undo", onClick: onUndo },
        duration: 30_000,
      }),
    );
  });

  it("dismisses the previous toast before showing the next one", () => {
    showUndoToast("Copper Sword", true, vi.fn());
    const firstId = toast.mock.results.at(-1)?.value as string;
    dismiss.mockClear();

    showUndoToast("Copper Sword", false, vi.fn());

    expect(dismiss).toHaveBeenCalledExactlyOnceWith(firstId);
    expect(toast).toHaveBeenCalledTimes(2);
    expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(
      toast.mock.invocationCallOrder[1] ?? 0,
    );
  });
});

describe("questToastMessage", () => {
  const [firstRecipe, secondRecipe] = recordKeys(trackerData.recipes);

  it("describes each state a quest toggle lands on", () => {
    expect(questToastMessage("Fishing", "obtained", [], "en")).toBe('Marked "Fishing" obtained');
    expect(questToastMessage("Fishing", "completed", [], "en")).toBe('Marked "Fishing" completed');
    expect(questToastMessage("Fishing", "none", [], "en")).toBe('Reset "Fishing"');
  });

  it("names a single unlocked recipe", () => {
    expect(questToastMessage("Fishing", "completed", [firstRecipe], "en")).toBe(
      `Marked "Fishing" completed and unlocked "${getName("recipes", firstRecipe, "en")}"`,
    );
  });

  it("counts several unlocked recipes", () => {
    expect(questToastMessage("Fishing", "completed", [firstRecipe, secondRecipe], "en")).toBe(
      'Marked "Fishing" completed and unlocked 2 recipes',
    );
  });
});

describe("showQuestToast", () => {
  beforeEach(() => {
    toast.mockClear();
    dismiss.mockClear();
  });

  it("uses the undo toast's timeout and undo action", () => {
    const onUndo = vi.fn();

    showQuestToast("Fishing", "completed", [], "en", onUndo);

    expect(toast).toHaveBeenCalledWith(
      'Marked "Fishing" completed',
      expect.objectContaining({ cancel: { label: "Undo", onClick: onUndo }, duration: 30_000 }),
    );
  });

  it("replaces any visible undo toast, including a check-off toast", () => {
    showUndoToast("Copper Sword", true, vi.fn());
    const firstId = toast.mock.results.at(-1)?.value as string;
    dismiss.mockClear();

    showQuestToast("Fishing", "obtained", [], "en", vi.fn());

    expect(dismiss).toHaveBeenCalledExactlyOnceWith(firstId);
  });
});
