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
    expect(body).toContain('data-sprite-slot="spoilered"');
    expect(body).toContain('crossorigin="anonymous"');
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
    expect(body).toContain('data-sprite-slot="complete"');
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
    expect(body).toContain('data-sprite-slot="ready"');
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

  it("renders a clipped tracker paper and persistent source paper when sourced", () => {
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
    expect(body).toContain('aria-controls="sources-cherry-cobbler-');
    expect(body).toContain('data-source-state="closed"');
    expect(body).toContain("data-tracker-paper");
    expect(body).toContain("tracker-paper__surface--cutout");
    expect(body).toContain("data-tracker-paper-diagonal");
    expect(body).toContain('d="M 26.5 0.5 L 0.5 26.5"');
    expect(body).toContain('stroke-width="1"');
    expect(body).toContain('vector-effect="non-scaling-stroke"');
    expect(body).toContain('shape-rendering="geometricPrecision"');
    expect(body).toContain("data-source-paper");
  });

  it("renders no source paper or diagonal when there are no sources", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "visible" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(body).toContain('data-source-state="none"');
    expect(body).toContain("data-tracker-paper");
    expect(body).not.toContain("data-tracker-paper-diagonal");
    expect(body).not.toContain("data-source-paper");
  });
});
