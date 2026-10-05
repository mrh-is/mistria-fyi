import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import FoldoutPanelHarness from "#lib/components/foldout-panel.test-harness.svelte";

function renderPanel(props: { dialog?: boolean; withHeaderAction?: boolean } = {}) {
  const onclose = vi.fn();
  render(FoldoutPanelHarness, { onclose, ...props });
  return onclose;
}

afterEach(() => {
  cleanup();
});

describe("FoldoutPanel", () => {
  it("exposes itself as a labelled modal dialog with a close control", async () => {
    const onclose = renderPanel();

    const dialog = screen.getByRole("dialog", { name: "Harness" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("id", "harness-panel");

    await fireEvent.click(within(dialog).getByRole("button", { name: "Close Harness" }));
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onclose = renderPanel();

    await fireEvent.keyDown(document, { key: "Escape" });

    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab and Shift+Tab within the panel", async () => {
    renderPanel({ withHeaderAction: true });
    const dialog = screen.getByRole("dialog");
    const headerAction = within(dialog).getByRole("button", { name: "Header action" });
    const last = within(dialog).getByRole("button", { name: "Last" });

    last.focus();
    await fireEvent.keyDown(document, { key: "Tab" });
    expect(headerAction).toHaveFocus();

    await fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("pulls focus into the panel when Tab starts outside it", async () => {
    renderPanel();
    const dialog = screen.getByRole("dialog");

    screen.getByRole("button", { name: "Outside after" }).focus();
    await fireEvent.keyDown(document, { key: "Tab" });
    expect(within(dialog).getByRole("button", { name: "Close Harness" })).toHaveFocus();

    screen.getByRole("button", { name: "Outside before" }).focus();
    await fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("renders as a plain section without trapping focus when not a dialog", async () => {
    const onclose = renderPanel({ dialog: false });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: "Harness" })).not.toHaveAttribute("aria-modal");

    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    await fireEvent.keyDown(document, { key: "Tab" });
    expect(last).toHaveFocus();

    await fireEvent.keyDown(document, { key: "Escape" });
    expect(onclose).not.toHaveBeenCalled();
  });
});
