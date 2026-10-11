import { describe, expect, it } from "vitest";

import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import AboutPage from "./+page.svelte";

describe("about and legal page", () => {
  it("states the project’s identity, ownership boundary, data version, and contact", () => {
    const { container, queries, text } = renderToFragment(AboutPage, { props: {} });

    expect(text).toContain("independent, unofficial, & noncommercial fan project");
    expect(text).toContain("affiliated with, endorsed by, supported by, or sponsored by");
    expect(text).toMatch(/progress in\s+Fields of Mistria\./u);
    expect(text).toMatch(/maintained by\s+Michael Helmbrecht\./u);
    expect(text).toMatch(/sponsored by\s+Villager Studio\s+\(though, call me!\)\./u);
    expect(text).toContain("all the content therein");
    expect(text).toContain("game version 1.0.6");
    expect(text).toContain("briefly be out of date");
    expect(container.querySelector("a[href='mailto:michael@mistria.fyi']")).not.toBeNull();
    expect(container.querySelector(".feedback-icon")).not.toBeNull();
    expect(queries.getByRole("link", { name: "Privacy" })).toBeTruthy();
    expect(queries.getByRole("button", { name: "AI disclosure" })).toBeTruthy();
    expect(queries.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe("/en");
  });
});
