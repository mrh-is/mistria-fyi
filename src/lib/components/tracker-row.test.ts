import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TrackerRow from "$lib/components/tracker-row.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

describe("TrackerRow", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  it("renders a spoiler overlay for a spoilered row", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "spoilered" },
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });
    expect(body).toContain('aria-label="Reveal spoiler"');
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('aria-label="Check spoilered item"');
  });

  it("reveals the name for a completed row, unlike a spoilered one", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "completed" },
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(body).toContain("Cherry Cobbler");
    expect(body).not.toContain("Reveal spoiler");
  });

  it("shows the entity name for a visible row", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "visible" },
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(body).toContain("Cherry Cobbler");
    expect(body).toContain('aria-label="Check Cherry Cobbler"');
  });

  it("marks a completed row for uncheck", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "completed" },
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
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sources: [{ type: "default" }],
      },
    });

    expect(body).toContain('aria-label="Cherry Cobbler sources"');
  });
});
