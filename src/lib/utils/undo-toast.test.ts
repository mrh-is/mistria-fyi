import { beforeEach, describe, expect, it, vi } from "vitest";

import { showUndoToast } from "$lib/utils/undo-toast.js";

const toast = vi.hoisted(() => vi.fn(() => "toast-id"));
const dismiss = vi.hoisted(() => vi.fn());

vi.mock("svelte-sonner", () => ({ dismiss, toast }));

describe("showUndoToast", () => {
  beforeEach(() => {
    toast.mockClear();
    dismiss.mockClear();
  });

  it("keeps the undo action available without an automatic deadline", () => {
    const onUndo = vi.fn();

    showUndoToast("Copper Sword", true, onUndo);

    expect(toast).toHaveBeenCalledWith(
      'Marked "Copper Sword" complete',
      expect.objectContaining({
        cancel: { label: "Undo", onClick: onUndo },
        duration: Number.POSITIVE_INFINITY,
      }),
    );
  });
});
