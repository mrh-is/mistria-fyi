import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ExpandableSectionHarness from "$lib/components/expandable-section.test-harness.svelte";
import { FeedbackContext } from "$lib/feedback/context.svelte.js";

describe("ExpandableSection reportable registration", () => {
  it("connects the disclosure trigger to its controlled content", async () => {
    const feedbackContext = new FeedbackContext();
    const view = render(ExpandableSectionHarness, {
      feedbackContext,
      name: "Spells",
    });

    const trigger = view.getByRole("button", { name: "Spells" });
    expect(trigger).toHaveAttribute("aria-controls", "expandable-spells");

    await fireEvent.click(trigger);
    expect(view.container.querySelector("#expandable-spells")).toBeInTheDocument();
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
