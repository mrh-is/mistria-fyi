import { describe, expect, it, vi } from "vitest";

import { FeedbackContext } from "#lib/feedback/context.svelte.js";

import type { ReportTarget } from "#lib/feedback/types.js";

const metadata: ReportTarget = {
  category: "recipe",
  displayName: "Tomato Soup",
  entityId: "tomato_soup",
  page: "/recipes",
};

describe("FeedbackContext", () => {
  it("registers, updates, and removes reportable elements", () => {
    const context = new FeedbackContext();
    const element = document.createElement("div");
    const cleanup = context.reportableAttachment(metadata)(element);

    expect(context.registrations.get(element)).toEqual(metadata);

    const updated = { ...metadata, displayName: "Tomato Soup recipe" };
    const secondCleanup = context.reportableAttachment(updated)(element);
    expect(context.registrations.get(element)).toEqual(updated);

    secondCleanup?.();
    cleanup?.();
    expect(context.registrations.has(element)).toBe(false);
  });

  it("selects an element and finishes picker mode", async () => {
    const context = new FeedbackContext();
    const onSelect = vi.fn();
    const onFinish = vi.fn();

    context.startPicking(onSelect, onFinish);
    context.select(metadata);

    expect(context.isPicking).toBe(false);
    expect(onSelect).toHaveBeenCalledWith(metadata);
    await vi.waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
  });

  it("cancels without selecting", async () => {
    const context = new FeedbackContext();
    const onSelect = vi.fn();
    const onFinish = vi.fn();

    context.startPicking(onSelect, onFinish);
    context.cancel();

    expect(onSelect).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
  });
});
