import { describe, expect, it } from "vitest";

import PageHeader from "#lib/components/page-header.svelte";

import { renderToFragment } from "./render-to-fragment.js";

describe("renderToFragment", () => {
  it("parses SSR output into a queryable DOM", () => {
    const { container, queries } = renderToFragment(PageHeader, { props: { title: "Settings" } });

    expect(queries.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(container.querySelector("[data-page-header='generic']")).not.toBeNull();
    expect(queries.queryByText("Nonexistent")).toBeNull();
  });
});
