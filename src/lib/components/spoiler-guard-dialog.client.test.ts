import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";

afterEach(() => {
  cleanup();
});

describe("SpoilerGuardDialog", () => {
  it("renders nothing until the guard holds a condition", () => {
    const guard = createSpoilerGuard();
    render(SpoilerGuardDialog, { guard });

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("opens for a guarded action & runs it on confirm", async () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();
    render(SpoilerGuardDialog, { guard });

    guard.guard({ type: "minesLevel", floor: 20 }, action);
    await tick();

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Yes, just this item" }));
    expect(action).toHaveBeenCalledTimes(1);
  });
});
