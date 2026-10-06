import { beforeEach, describe, expect, it, vi } from "vitest";

import { showUndoToast } from "#lib/effects/undo-toast.js";

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
