import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TrackerRow from "$lib/components/tracker-row.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

describe("TrackerRow", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  it("does not reveal a completed row whose visibility remains redacted", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "redacted" },
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });
    expect(body).not.toContain("Cherry Cobbler");
    expect(body).toContain("Redacted");
    expect(body).toContain('aria-label="Check redacted item"');
  });

  it("provides a spoiler-safe label for a completed redacted row", () => {
    const { body } = render(TrackerRow, {
      props: {
        display: { mode: "redacted" },
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(body).not.toContain("Cherry Cobbler");
    expect(body).toContain('aria-label="Check redacted item"');
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
