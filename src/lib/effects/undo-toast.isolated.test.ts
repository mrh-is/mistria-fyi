import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import {
  clearUndoToasts,
  questToastMessage,
  showQuestToast,
  showUndoToast,
} from "#lib/effects/undo-toast.js";
import { recordKeys } from "#lib/utils/record.js";

interface UndoToastOptions {
  cancel: { label: string; onClick: () => void };
  duration: number;
  onAutoClose: () => void;
}

const dismiss = vi.hoisted(() => vi.fn());
/** Toasts other than undos that the page is showing, such as an error. */
const otherToasts = vi.hoisted((): { id: string }[] => []);
const toast = vi.hoisted(() => {
  let nextId = 0;
  return vi.fn((_message: string, _options: UndoToastOptions): string => {
    nextId += 1;
    return `toast-${nextId}`;
  });
});

/** The message & options of the newest toast. */
function lastToast(): [message: string, options: UndoToastOptions] {
  const call = toast.mock.calls.at(-1);
  if (call === undefined) throw new Error("No toast was shown");
  return call;
}

vi.mock("svelte-sonner", () => ({
  toast: Object.assign(toast, {
    dismiss,
    // The undo toasts this module showed & hasn't dismissed, plus the page's other toasts.
    getActiveToasts: () => [
      ...toast.mock.results
        .map((result) => ({ id: result.value as string }))
        .filter(({ id }) => !dismiss.mock.calls.some(([dismissed]) => dismissed === id)),
      ...otherToasts,
    ],
  }),
}));

describe("showUndoToast", () => {
  beforeEach(() => {
    clearUndoToasts();
    otherToasts.length = 0;
    toast.mockClear();
    dismiss.mockClear();
  });

  it("keeps the undo action available for an extended timeout", () => {
    const onUndo = vi.fn();

    showUndoToast("Copper Sword", true, onUndo);

    const [message, options] = lastToast();
    expect(message).toBe("Checked off “Copper Sword”");
    expect(options.cancel.label).toBe("Undo");
    expect(options.duration).toBe(30_000);
    options.cancel.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("stacks undo toasts for different items", () => {
    showUndoToast("Copper Sword", true, vi.fn());
    showUndoToast("Chub", true, vi.fn());

    expect(toast).toHaveBeenCalledTimes(2);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("replaces an item's own toast, since an older undo would flip it the wrong way", () => {
    showUndoToast("Copper Sword", true, vi.fn());
    const firstId = toast.mock.results.at(-1)?.value as string;
    showUndoToast("Chub", true, vi.fn());

    showUndoToast("Copper Sword", false, vi.fn());

    expect(dismiss).toHaveBeenCalledExactlyOnceWith(firstId);
    expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(
      toast.mock.invocationCallOrder[2] ?? 0,
    );
  });

  it("keeps at most three undo toasts, dropping the oldest", () => {
    showUndoToast("Copper Sword", true, vi.fn());
    const oldestId = toast.mock.results.at(-1)?.value as string;
    showUndoToast("Chub", true, vi.fn());
    showUndoToast("Carp", true, vi.fn());

    showUndoToast("Perch", true, vi.fn());

    expect(dismiss).toHaveBeenCalledExactlyOnceWith(oldestId);
  });

  it("leaves the slots other toasts hold, so undos never hide an error", () => {
    otherToasts.push({ id: "save-error" }, { id: "starter-items" });
    showUndoToast("Copper Sword", true, vi.fn());
    const firstId = toast.mock.results.at(-1)?.value as string;

    showUndoToast("Chub", true, vi.fn());

    expect(dismiss).toHaveBeenCalledExactlyOnceWith(firstId);
  });

  it("frees an item's slot once its toast closes", () => {
    showUndoToast("Copper Sword", true, vi.fn());
    lastToast()[1].onAutoClose();

    showUndoToast("Copper Sword", false, vi.fn());

    expect(dismiss).not.toHaveBeenCalled();
  });
});

describe("questToastMessage", () => {
  const [firstRecipe, secondRecipe] = recordKeys(trackerData.recipes);

  it("describes each state a quest toggle lands on", () => {
    expect(questToastMessage("Fishing", "obtained", [], "en")).toBe("Started “Fishing”");
    expect(questToastMessage("Fishing", "completed", [], "en")).toBe("Checked off “Fishing”");
    expect(questToastMessage("Fishing", "none", [], "en")).toBe("Reset “Fishing”");
  });

  it("names a single unlocked recipe", () => {
    expect(questToastMessage("Fishing", "completed", [firstRecipe], "en")).toBe(
      `Checked off “Fishing” and unlocked “${getName("recipes", firstRecipe, "en")}”`,
    );
  });

  it("counts several unlocked recipes", () => {
    expect(questToastMessage("Fishing", "completed", [firstRecipe, secondRecipe], "en")).toBe(
      "Checked off “Fishing” and unlocked 2 recipes",
    );
    expect(
      questToastMessage("Fishing", "completed", [firstRecipe, secondRecipe, firstRecipe], "ru"),
    ).toBe("Отмечено: «Fishing», открыто 3 рецепта");
  });
});

describe("showQuestToast", () => {
  beforeEach(() => {
    clearUndoToasts();
    otherToasts.length = 0;
    otherToasts.length = 0;
    toast.mockClear();
    dismiss.mockClear();
  });

  it("uses the undo toast's timeout and undo action", () => {
    const onUndo = vi.fn();

    showQuestToast("Fishing", "completed", [], "en", onUndo);

    const [message, options] = lastToast();
    expect(message).toBe("Checked off “Fishing”");
    expect(options.cancel.label).toBe("Undo");
    expect(options.duration).toBe(30_000);
    options.cancel.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("stacks with check-off toasts and replaces its own quest's toast", () => {
    showUndoToast("Copper Sword", true, vi.fn());
    showQuestToast("Fishing", "obtained", [], "en", vi.fn());
    const questId = toast.mock.results.at(-1)?.value as string;
    expect(dismiss).not.toHaveBeenCalled();

    showQuestToast("Fishing", "completed", [], "en", vi.fn());

    expect(dismiss).toHaveBeenCalledExactlyOnceWith(questId);
  });
});
