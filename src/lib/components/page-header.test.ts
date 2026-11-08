import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import PageHeader from "#lib/components/page-header.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

describe("PageHeader", () => {
  it("renders category identity in an edge ribbon with linear progress", () => {
    const { container, queries } = renderToFragment(PageHeader, {
      props: {
        category: "almanac",
        progress: { completed: 7, completedShown: 7, todo: 3, total: 20, waiting: 10 },
        title: "Almanac",
      },
    });

    const header = container.querySelector("header");
    expect(header?.dataset.pageHeader).toBe("category");
    expect(header?.getAttribute("style")).toContain("--category-progress-percent: 35%");
    expect(queries.getByRole("heading", { level: 1, name: "Almanac" })).toBeTruthy();
    expect(queries.getByText("7 / 20")).toBeTruthy();
    expect(queries.getByText("7 of 20 completed")).toBeTruthy();
    expect(header?.getAttribute("style")).toContain("--category-todo-percent: 15%");
    expect(header?.querySelector("[data-page-header-ribbon]")).not.toBeNull();
  });

  it("keeps generic pages free of category-only decoration", () => {
    const { container, queries } = renderToFragment(PageHeader, { props: { title: "Settings" } });

    const header = container.querySelector("header");
    expect(header?.dataset.pageHeader).toBe("generic");
    expect(header?.getAttribute("style")).toBeNull();
    expect(queries.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(container.querySelector("[data-page-header-ribbon]")).toBeNull();
  });

  it("marks a completed category header for its gold-leaf edge", () => {
    const { container } = renderToFragment(PageHeader, {
      props: {
        category: "museum",
        progress: { completed: 20, completedShown: 20, todo: 0, total: 20, waiting: 0 },
        title: "Museum",
      },
    });

    const header = container.querySelector("header");
    expect(header?.classList.contains("page-header--complete")).toBe(true);
    expect(header?.getAttribute("style")).toContain("--category-progress-percent: 100%");
  });

  it("aligns the completed gold-leaf edge gradients with the ribbon notch", () => {
    const source = readFileSync(new URL("page-header.svelte", import.meta.url), "utf8");

    // Mobile ribbon notch on left: top half to top right, bottom half to bottom right
    expect(source).toMatch(
      /\.page-header--complete \.page-header__ribbon::after \{[\s\S]*?linear-gradient\(\s*to top right[\s\S]*?linear-gradient\(\s*to bottom right/,
    );

    // Desktop ribbon notch on right: top half to top left, bottom half to bottom left
    expect(source).toMatch(
      /@media \(min-width: 701px\)[\s\S]*?\.page-header--complete \.page-header__ribbon::after \{[\s\S]*?linear-gradient\(\s*to top left[\s\S]*?linear-gradient\(\s*to bottom left/,
    );
  });
});
