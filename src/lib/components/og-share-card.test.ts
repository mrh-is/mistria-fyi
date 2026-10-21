import { describe, expect, it } from "vitest";

import OgShareCard from "#lib/components/og-share-card.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

describe("OgShareCard", () => {
  it("gives the shared stripe a theme-aware ribbon color and obscures the completed count", () => {
    const { container, queries } = renderToFragment(OgShareCard, { props: { total: 5243 } });

    const stripe = queries.getByRole("link");
    expect(stripe.getAttribute("style")).toContain("--category-color: var(--color-brand-accent)");
    expect(stripe.querySelector(".category-count")?.textContent).toContain("??");
    expect(container.querySelector("[data-category-ribbon]")).toBeTruthy();
  });
});
