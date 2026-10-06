import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import StatusNote from "#lib/components/status-note.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

const children = createRawSnippet(() => ({ render: () => "<p>Result details</p>" }));

describe("StatusNote", () => {
  it("announces errors & warnings as alerts and keeps nested content", () => {
    for (const tone of ["error", "warning"] as const) {
      const { container, queries } = renderToFragment(StatusNote, {
        props: { children, class: "mt-3", tone },
      });
      const note = queries.getByRole("alert");
      expect(note.classList.contains(`status-note--${tone}`)).toBe(true);
      expect(note.classList.contains("mt-3")).toBe(true);
      expect(container.querySelector("p")?.textContent).toBe("Result details");
    }
  });

  it("renders success without announcing it as an alert", () => {
    const { container, queries } = renderToFragment(StatusNote, {
      props: { children, tone: "success" },
    });
    expect(queries.queryByRole("alert")).toBeNull();
    expect(container.querySelector(".status-note--success")?.textContent).toContain(
      "Result details",
    );
  });
});
