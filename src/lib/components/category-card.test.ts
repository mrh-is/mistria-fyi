import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import CategoryCard from "$lib/components/category-card.svelte";

describe("CategoryCard", () => {
  it("renders a named category stripe with progress and a decorative ribbon", () => {
    const { body } = render(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 7, filtered: 13, total: 20 },
      },
    });

    expect(body).toContain("data-category-stripe");
    expect(body).toContain('aria-label="Almanac, 7 of 20 completed"');
    expect(body).toContain("data-category-ribbon");
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain("7");
    expect(body).toContain("/");
    expect(body).toContain("20");
    expect(body).toContain("--category-progress: 35%");
  });

  it("uses the filtered total in the visible and accessible progress count", () => {
    const { body } = render(CategoryCard, {
      props: {
        key: "museum",
        progress: { completed: 4, filtered: 6, total: 20 },
      },
    });

    expect(body).toContain('aria-label="Museum, 4 of 10 completed"');
    expect(body).toContain("--category-progress: 40%");
  });
});
