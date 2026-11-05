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
        progress: { completed: 7, remainingInScope: 13, total: 20 },
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

  it("uses the full total for the fraction & bar, with the in-scope count beneath", () => {
    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "museum",
        progress: { completed: 4, remainingInScope: 6, total: 20 },
      },
    });

    const stripe = queries.getByRole("link", { name: "Museum, 4 of 20 completed, 6 for now" });
    expect(stripe.getAttribute("style")).toContain("--category-progress-percent: 20%");
    expect(stripe.textContent).toContain("6 for now");
  });

  it("mutes a category with nothing left in scope", () => {
    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "quests",
        progress: { completed: 88, remainingInScope: 0, total: 140 },
      },
    });

    const stripe = queries.getByRole("link", { name: "Quests, 88 of 140 completed, done for now" });
    expect(stripe.classList.contains("category-stripe--done-for-now")).toBe(true);
  });

  it("leaves out the second line when filters exclude nothing", () => {
    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "skills",
        progress: { completed: 48, remainingInScope: 12, total: 60 },
      },
    });

    const stripe = queries.getByRole("link", { name: "Skills, 48 of 60 completed" });
    expect(stripe.querySelector("[data-progress-scope]")).toBeNull();
  });

  it("retains grouped four-digit counts", () => {
    const { container } = renderToFragment(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 1686, remainingInScope: 114, total: 1800 },
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
        progress: { completed: 20, remainingInScope: 0, total: 20 },
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
        progress: { completed: 7, remainingInScope: 13, total: 20 },
      },
    });

    expect(queries.getByRole("link", { name: "Almanac、20件中7件完了" })).toBeTruthy();
  });

  it("localizes the accessible progress phrase for Russian", () => {
    overwriteGetLocale(() => "ru");

    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 7, remainingInScope: 13, total: 20 },
      },
    });

    expect(queries.getByRole("link", { name: "Almanac, выполнено 7 из 20" })).toBeTruthy();
  });
});
