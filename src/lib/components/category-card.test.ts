import { afterEach, describe, expect, it } from "vitest";

import CategoryCard from "#lib/components/category-card.svelte";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

describe("CategoryCard", () => {
  const defaultGetLocale = getLocale;

  afterEach(() => {
    overwriteGetLocale(defaultGetLocale);
  });

  it("renders a named category stripe with progress and a decorative ribbon", () => {
    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 7, completedShown: 7, todo: 13, total: 20, waiting: 0 },
      },
    });

    const stripe = queries.getByRole("link", { name: "Almanac, 7 of 20 completed" });
    expect(stripe.matches("[data-category-stripe]")).toBe(true);
    expect(stripe.getAttribute("style")).toContain("--category-progress-percent: 35%");
    expect(stripe.querySelector("[data-category-ribbon]")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(
      stripe.querySelector(".category-count")?.textContent.replaceAll(/\s+/g, " ").trim(),
    ).toBe("7 / 20");
  });

  it("uses the full total for the fraction & bar, with a To do tint & no second line", () => {
    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "museum",
        progress: { completed: 4, completedShown: 4, todo: 6, total: 20, waiting: 10 },
      },
    });

    const stripe = queries.getByRole("link", { name: "Museum, 4 of 20 completed" });
    expect(stripe.getAttribute("style")).toContain("--category-progress-percent: 20%");
    expect(stripe.getAttribute("style")).toContain("--category-todo-percent: 30%");
    expect(stripe.textContent).not.toContain("for now");
  });

  it("quiets a category on the Not now shelf", () => {
    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "quests",
        progress: { completed: 88, completedShown: 88, todo: 0, total: 140, waiting: 52 },
        quiet: true,
      },
    });

    const stripe = queries.getByRole("link", { name: "Quests, 88 of 140 completed" });
    expect(stripe.classList.contains("category-stripe--quiet")).toBe(true);
  });

  it("retains grouped four-digit counts", () => {
    const { container } = renderToFragment(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 1686, completedShown: 1686, todo: 114, total: 1800, waiting: 0 },
      },
    });

    expect(
      container.querySelector(".category-count")?.textContent.replaceAll(/\s+/g, " ").trim(),
    ).toBe("1,686 / 1,800");
  });

  it("keeps the category identity when adding the completed gold-leaf edge", () => {
    const { container } = renderToFragment(CategoryCard, {
      props: {
        key: "animals",
        progress: { completed: 20, completedShown: 20, todo: 0, total: 20, waiting: 0 },
      },
    });

    const stripe = container.querySelector("[data-category-stripe]");
    expect(stripe?.classList.contains("category-stripe--complete")).toBe(true);
    expect(stripe?.getAttribute("style")).toContain(
      "--category-color: var(--color-category-animals)",
    );
  });

  it("localizes the accessible progress phrase for Japanese", () => {
    overwriteGetLocale(() => "ja");

    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 7, completedShown: 7, todo: 13, total: 20, waiting: 0 },
      },
    });

    expect(queries.getByRole("link", { name: "Almanac、20件中7件完了" })).toBeTruthy();
  });

  it("localizes the accessible progress phrase for Russian", () => {
    overwriteGetLocale(() => "ru");

    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 7, completedShown: 7, todo: 13, total: 20, waiting: 0 },
      },
    });

    expect(queries.getByRole("link", { name: "Almanac, выполнено 7 из 20" })).toBeTruthy();
  });
});
