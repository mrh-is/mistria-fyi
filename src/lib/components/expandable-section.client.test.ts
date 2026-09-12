import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ExpandableSectionHarness from "$lib/components/expandable-section.test-harness.svelte";
import { FeedbackContext } from "$lib/feedback/context.svelte.js";

describe("ExpandableSection", () => {
  it("connects the disclosure trigger to its controlled content", async () => {
    const feedbackContext = new FeedbackContext();
    const view = render(ExpandableSectionHarness, {
      feedbackContext,
      name: "Spells",
    });

    const trigger = view.getByRole("button", { name: "Spells" });
    const contentId = trigger.getAttribute("aria-controls");
    if (!contentId) throw new Error("Expected disclosure trigger to control section content");
    expect(contentId).toMatch(/^expandable-.+-spells$/);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(contentId)).toBeInTheDocument();
  });

  it("assigns unique controlled-content IDs to repeated section names", () => {
    const feedbackContext = new FeedbackContext();
    const first = render(ExpandableSectionHarness, { feedbackContext, name: "Spells" });
    const second = render(ExpandableSectionHarness, { feedbackContext, name: "Spells" });
    const firstTrigger = first.container.querySelector("button");
    const secondTrigger = second.container.querySelector("button");

    expect(firstTrigger?.getAttribute("aria-controls")).not.toBe(
      secondTrigger?.getAttribute("aria-controls"),
    );
  });

  it("renders a spaced count and a bounded decorative progress rule", () => {
    const view = render(ExpandableSectionHarness, {
      count: 7,
      feedbackContext: new FeedbackContext(),
      name: "Crops",
      total: 4,
    });

    expect(view.getByText("4 / 4")).toHaveAttribute("aria-hidden", "true");
    expect(view.getByRole("button", { name: "Crops, 4 of 4 completed" })).toBeInTheDocument();
    expect(view.getByTestId("section-progress")).toHaveAttribute("aria-hidden", "true");
    expect(view.getByTestId("section-progress-fill")).toHaveStyle("width: 100%");
  });

  it("exposes explicit nesting depth without opening the section", () => {
    const view = render(ExpandableSectionHarness, {
      count: 0,
      depth: 2,
      feedbackContext: new FeedbackContext(),
      name: "Rings",
      total: 0,
    });

    expect(view.container.querySelector("[data-tracker-section]")).toHaveAttribute(
      "data-section-depth",
      "2",
    );
    expect(view.container.querySelector("[data-tracker-section]")).toHaveStyle(
      "--section-depth: 2",
    );
    expect(view.queryByText("Test content")).not.toBeInTheDocument();
  });

  it("preserves default-open, forced-open, and empty-section behavior", () => {
    const defaultOpen = render(ExpandableSectionHarness, {
      defaultOpen: true,
      feedbackContext: new FeedbackContext(),
      name: "Known",
    });
    const forcedOpen = render(ExpandableSectionHarness, {
      feedbackContext: new FeedbackContext(),
      forceOpen: true,
      name: "Filtered",
    });
    const empty = render(ExpandableSectionHarness, {
      count: 0,
      feedbackContext: new FeedbackContext(),
      name: "Empty",
      total: 0,
    });

    expect(defaultOpen.getByRole("button", { name: "Known" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(forcedOpen.getByRole("button", { name: "Filtered" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(empty.getByRole("button", { name: "Empty, 0 of 0 completed" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("registers when reportCategory is provided", async () => {
    const feedbackContext = new FeedbackContext();
    const view = render(ExpandableSectionHarness, {
      feedbackContext,
      name: "Spells",
      reportCategory: "mines",
      reportEntityId: "spells",
    });

    await waitFor(() => {
      expect(feedbackContext.registrations.size).toBe(1);
    });
    expect([...feedbackContext.registrations.values()][0]).toMatchObject({
      category: "mines",
      displayName: "Spells",
      entityId: "spells",
    });

    view.unmount();
    expect(feedbackContext.registrations.size).toBe(0);
  });

  it("does not register when reportCategory is absent", async () => {
    const feedbackContext = new FeedbackContext();
    render(ExpandableSectionHarness, {
      feedbackContext,
      name: "Spells",
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(feedbackContext.registrations.size).toBe(0);
  });
});
