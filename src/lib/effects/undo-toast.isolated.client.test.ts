import { afterEach, describe, expect, it, vi } from "vitest";

import { captureUndoFocus, clearUndoToasts, showUndoToast } from "#lib/effects/undo-toast.js";

interface UndoToastOptions {
  cancel: { label: string; onClick: () => void };
}

const toast = vi.hoisted(() => vi.fn((_message: string, _options: UndoToastOptions) => "toast-1"));

vi.mock("svelte-sonner", () => ({
  toast: Object.assign(toast, { dismiss: vi.fn(), getActiveToasts: () => [] }),
}));

/** A place holding one ledger row for `fact`, as Everything prints one fact under several places. */
function place(id: string, fact: string): HTMLElement {
  const section = document.createElement("section");
  section.id = id;
  section.innerHTML = `<div data-ledger-fact="${fact}"><button class="tracker-checkbox">Check</button></div>`;
  document.body.append(section);
  return section;
}

function checkbox(section: HTMLElement): HTMLElement {
  const element = section.querySelector<HTMLElement>(".tracker-checkbox");
  if (!element) throw new Error(`No checkbox in ${section.id}`);
  return element;
}

/** Press the toast's Undo while it has focus, as a keyboard reader would. */
async function pressUndo(): Promise<void> {
  const options = toast.mock.calls.at(-1)?.[1];
  if (!options) throw new Error("No toast was shown");
  const action = document.createElement("button");
  action.dataset.sonnerToast = "";
  document.body.append(action);
  action.focus();
  options.cancel.onClick();
  action.remove();
  await vi.waitFor(() => {
    expect(document.activeElement).not.toBe(document.body);
  });
}

describe("focus after Undo", () => {
  afterEach(() => {
    clearUndoToasts();
    toast.mockClear();
    document.body.replaceChildren();
  });

  it("prefers the row's copy in its own place when the original row is gone", async () => {
    // jsdom doesn't lay anything out, so treat every connected element as visible.
    vi.spyOn(HTMLElement.prototype, "checkVisibility").mockImplementation(function isConnected(
      this: HTMLElement,
    ) {
      return this.isConnected;
    });
    const balor = place("store-balor", "acorn");
    const inn = place("store-inn", "acorn");
    checkbox(inn).focus();
    const focus = captureUndoFocus();
    showUndoToast(
      "Acorn",
      true,
      () => {
        // Undo rebuilds the row, replacing the focused checkbox with a new one in the same place.
        const replaced = place("replacement", "acorn");
        inn.replaceChildren(...replaced.childNodes);
        replaced.remove();
      },
      false,
      focus,
    );

    await pressUndo();

    expect(document.activeElement).toBe(checkbox(inn));
    expect(inn.contains(document.activeElement)).toBe(true);
    expect(balor.contains(document.activeElement)).toBe(false);
  });
});
