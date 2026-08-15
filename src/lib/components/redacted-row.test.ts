import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

import RedactedRow from "$lib/components/redacted-row.svelte";

describe("RedactedRow", () => {
  it("does not reveal a completed item whose visibility remains redacted", () => {
    const { body } = render(RedactedRow, {
      props: {
        completed: true,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });
    expect(body).not.toContain("Cherry Cobbler");
    expect(body).toContain("Redacted");
    expect(body).toContain('aria-label="Uncheck redacted item"');
  });

  it("provides a spoiler-safe label for an incomplete item", () => {
    const { body } = render(RedactedRow, {
      props: {
        completed: false,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(body).not.toContain("Cherry Cobbler");
    expect(body).toContain('aria-label="Check redacted item"');
  });
});
