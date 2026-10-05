import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import PageHeader from "#lib/components/page-header.svelte";

describe("PageHeader", () => {
  it("renders category identity in an edge ribbon with linear progress", () => {
    const { body } = render(PageHeader, {
      props: {
        category: "almanac",
        progress: { completed: 7, filtered: 3, total: 20 },
        title: "Almanac",
      },
    });

    expect(body).toContain('data-page-header="category"');
    expect(body).toContain("<header");
    expect(body).toContain("data-page-header-ribbon");
    expect(body).toContain("7 / 20");
    expect(body).toContain("--category-progress: 35%");
  });

  it("keeps generic pages free of category-only decoration", () => {
    const { body } = render(PageHeader, { props: { title: "Settings" } });

    expect(body).toContain('data-page-header="generic"');
    expect(body).not.toContain("data-page-header-ribbon");
    expect(body).not.toContain("--category-progress");
  });

  it("marks a completed category header for its gold-leaf edge", () => {
    const { body } = render(PageHeader, {
      props: {
        category: "museum",
        progress: { completed: 20, filtered: 0, total: 20 },
        title: "Museum",
      },
    });

    expect(body).toContain("page-header--complete");
    expect(body).toContain("--category-progress: 100%");
  });
});
