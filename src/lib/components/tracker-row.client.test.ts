import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import TrackerRow from "$lib/components/tracker-row.svelte";
import { FeedbackContext } from "$lib/feedback/context.svelte.js";

describe("TrackerRow reportable metadata", () => {
  it("registers the whole row and preserves completion behavior", async () => {
    const feedbackContext = new FeedbackContext();
    const onToggle = vi.fn();
    const view = render(TrackerRow, {
      display: { mode: "visible" },
      feedbackContext,
      name: "Tomato Soup",
      onToggle,
      reportCategory: "recipe",
      reportEntityId: "tomato_soup",
    });

    await waitFor(() => {
      expect(feedbackContext.registrations.size).toBe(1);
    });
    expect([...feedbackContext.registrations.values()][0]).toMatchObject({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
    });

    await fireEvent.click(screen.getByRole("button", { name: "Check Tomato Soup" }));
    expect(onToggle).toHaveBeenCalledOnce();

    view.unmount();
    expect(feedbackContext.registrations.size).toBe(0);
  });

  it("moves focus to the next row after toggling a visible item", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    const list = document.createElement("div");
    document.body.append(list);
    const first = render(TrackerRow, {
      display: { mode: "visible" },
      name: "First item",
      onToggle: vi.fn(),
      reportCategory: "item",
      reportEntityId: "first",
    });
    const second = render(TrackerRow, {
      display: { mode: "visible" },
      name: "Second item",
      onToggle: vi.fn(),
      reportCategory: "item",
      reportEntityId: "second",
    });
    const firstRow = first.container.firstElementChild;
    const secondRow = second.container.firstElementChild;
    expect(firstRow).toBeTruthy();
    expect(secondRow).toBeTruthy();
    list.append(firstRow as HTMLElement, secondRow as HTMLElement);

    await fireEvent.click(screen.getByRole("button", { name: "Check First item" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Check Second item" }));
    vi.unstubAllGlobals();
  });
});
