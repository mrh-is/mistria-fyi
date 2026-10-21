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
    expect(stripe.querySelector(".category-count")?.textContent.replaceAll(/\s+/g, " ")).toBe(
      "7 / 20",
    );
  });

  it("uses the filtered total in the visible and accessible progress count", () => {
    const { queries } = renderToFragment(CategoryCard, {
      props: {
        key: "museum",
        progress: { completed: 4, remainingInScope: 6, total: 20 },
      },
    });

    const stripe = queries.getByRole("link", { name: "Museum, 4 of 10 completed" });
    expect(stripe.getAttribute("style")).toContain("--category-progress-percent: 40%");
  });

  it("retains grouped four-digit counts", () => {
    const { container } = renderToFragment(CategoryCard, {
      props: {
        key: "almanac",
        progress: { completed: 1686, remainingInScope: 114, total: 1800 },
      },
    });

    expect(container.querySelector(".category-count")?.textContent.replaceAll(/\s+/g, " ")).toBe(
      "1,686 / 1,800",
    );
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
