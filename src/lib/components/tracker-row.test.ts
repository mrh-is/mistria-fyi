import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TrackerRow from "$lib/components/tracker-row.svelte";
import { FeedbackContext } from "$lib/feedback/context.svelte.js";
import { userState } from "$lib/stores/user-state.svelte.js";

describe("TrackerRow", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  const reportProps = {
    feedbackContext: new FeedbackContext(),
    reportCategory: "recipe",
    reportEntityId: "cherry_cobbler",
  };

  it("renders a spoiler overlay for a spoilered row", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "spoilered" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sprite: "spr_ui_item_cherry_cobbler",
      },
    });
    expect(body).toContain('aria-label="Reveal spoiler"');
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('aria-label="Check spoilered item"');
    expect(body).toContain('data-item-sprite="spoilered"');
  });

  it("reveals the name for a completed row, unlike a spoilered one", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "completed" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sprite: "spr_ui_item_cherry_cobbler",
      },
    });

    expect(body).toContain("Cherry Cobbler");
    expect(body).not.toContain("Reveal spoiler");
    expect(body).toContain('data-item-sprite="complete"');
  });

  it("shows the entity name for a visible row", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "visible" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sprite: "spr_ui_item_cherry_cobbler",
      },
    });

    expect(body).toContain("Cherry Cobbler");
    expect(body).toContain('aria-label="Check Cherry Cobbler"');
    expect(body).toContain('data-item-sprite="ready"');
  });

  it("marks a completed row for uncheck", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "completed" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(body).toContain("Cherry Cobbler");
    expect(body).toContain('aria-label="Uncheck Cherry Cobbler"');
  });

  it("renders a source icon strip when sources are provided", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "visible" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sources: [{ type: "default" }],
      },
    });

    expect(body).toContain('aria-label="Cherry Cobbler sources"');
    expect(body).toContain("min-h-11 min-w-11");
    expect(body).toContain('aria-controls="sources-cherry-cobbler"');
  });
});
