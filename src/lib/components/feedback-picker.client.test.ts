import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPicker from "$lib/components/feedback-picker.svelte";
import { FeedbackContext } from "$lib/feedback/context.svelte.js";

const metadata = {
  category: "recipe",
  displayName: "Tomato Soup",
  entityId: "tomato_soup",
  page: "/recipes",
};

function registerVisibleElement(context: FeedbackContext): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({
      bottom: 144,
      height: 44,
      left: 12,
      right: 312,
      top: 100,
      width: 300,
      x: 12,
      y: 100,
    }) as DOMRect;
  document.body.append(element);
  context.reportable(metadata)(element);
  return element;
}

describe("FeedbackPicker", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a highlight for each visible reportable element", async () => {
    const context = new FeedbackContext();
    const element = registerVisibleElement(context);
    context.startPicking(vi.fn());
    const view = render(FeedbackPicker, { active: true, feedbackContext: context });

    const target = await screen.findByRole("button", {
      name: "Report feedback about Tomato Soup",
    });
    expect(target.style.left).toBe("12px");
    expect(target.style.top).toBe("100px");
    expect(target.style.width).toBe("300px");
    expect(target.style.height).toBe("44px");

    view.unmount();
    element.remove();
  });

  it("selects the highlighted element without activating the underlying control", async () => {
    const context = new FeedbackContext();
    const element = registerVisibleElement(context);
    const underlyingClick = vi.fn();
    const onSelect = vi.fn();
    element.addEventListener("click", underlyingClick);
    context.startPicking(onSelect);
    render(FeedbackPicker, { active: true, feedbackContext: context });

    await fireEvent.click(
      await screen.findByRole("button", { name: "Report feedback about Tomato Soup" }),
    );

    expect(onSelect).toHaveBeenCalledWith(metadata);
    expect(underlyingClick).not.toHaveBeenCalled();
    expect(context.isPicking).toBe(false);
    element.remove();
  });

  it("cancels with Escape", async () => {
    const context = new FeedbackContext();
    const onSelect = vi.fn();
    context.startPicking(onSelect);
    render(FeedbackPicker, { active: true, feedbackContext: context });

    await fireEvent.keyDown(window, { key: "Escape" });

    expect(context.isPicking).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("cycles focus between cancel and reportable elements", async () => {
    const context = new FeedbackContext();
    const element = registerVisibleElement(context);
    context.startPicking(vi.fn());
    render(FeedbackPicker, { active: true, feedbackContext: context });

    const cancel = await screen.findByRole("button", { name: "Cancel item picker" });
    await waitFor(() => {
      expect(cancel).toHaveFocus();
    });
    await fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Report feedback about Tomato Soup" })).toHaveFocus();
    await fireEvent.keyDown(window, { key: "Tab" });
    expect(cancel).toHaveFocus();
    element.remove();
  });

  it("does not highlight clipped or zero-sized elements", () => {
    const context = new FeedbackContext();
    const element = document.createElement("div");
    element.getBoundingClientRect = () =>
      ({ bottom: -1, height: 0, left: 0, right: 0, top: -1, width: 0, x: 0, y: -1 }) as DOMRect;
    document.body.append(element);
    context.reportable(metadata)(element);
    context.startPicking(vi.fn());
    render(FeedbackPicker, { active: true, feedbackContext: context });

    expect(screen.queryByRole("button", { name: "Report feedback about Tomato Soup" })).toBeNull();
    element.remove();
  });
});
