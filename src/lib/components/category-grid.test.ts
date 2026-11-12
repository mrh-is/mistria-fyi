import { afterEach, describe, expect, it } from "vitest";

import CategoryGrid from "#lib/components/category-grid.svelte";
import { overwriteGetLocale } from "#lib/i18n/locale-runtime.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

const complete = { completed: 2, completedShown: 2, todo: 0, total: 2, waiting: 0 };

const allComplete = {
  almanac: complete,
  animals: complete,
  cosmetics: complete,
  mines: complete,
  museum: complete,
  quests: complete,
  recipes: complete,
  renown: complete,
  skills: complete,
  villagers: complete,
};

const oneActiveOneComplete = {
  ...allComplete,
  almanac: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
};

describe("CategoryGrid", () => {
  afterEach(() => {
    overwriteGetLocale();
  });

  it("renders in-progress categories alphabetized by displayed name", () => {
    const { queries } = renderToFragment(CategoryGrid, {
      props: {
        progress: {
          almanac: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
          animals: { completed: 0, completedShown: 0, todo: 1, total: 2, waiting: 0 },
          cosmetics: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
          mines: { completed: 2, completedShown: 2, todo: 0, total: 2, waiting: 0 },
          museum: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
          quests: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
          recipes: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
          renown: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
          skills: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
          villagers: { completed: 1, completedShown: 1, todo: 1, total: 2, waiting: 0 },
        },
      },
    });

    const names = queries
      .getAllByRole("link")
      .map((link) => link.querySelector(".category-name")?.textContent);
    expect(names.indexOf("Almanac")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Almanac")).toBeLessThan(names.indexOf("Animals"));
    expect(names.indexOf("Skills")).toBeLessThan(names.indexOf("Villagers"));
  });

  it("keeps Not now open on the home page, as a quiet shelf", () => {
    const { queries } = renderToFragment(CategoryGrid, {
      props: {
        progress: {
          ...oneActiveOneComplete,
          quests: { completed: 1, completedShown: 1, todo: 0, total: 2, waiting: 1 },
        },
      },
    });

    const list = queries.getByRole("list", { name: "Not now categories" });
    const stripe = list.querySelector("[data-category-stripe]");
    expect(stripe?.classList.contains("category-stripe--quiet")).toBe(true);
    expect(queries.queryByRole("button", { expanded: false })).toBeNull();
  });

  it("drops a category with nothing to show", () => {
    const { queries } = renderToFragment(CategoryGrid, {
      props: {
        progress: {
          ...allComplete,
          almanac: { completed: 0, completedShown: 0, todo: 0, total: 2, waiting: 0 },
        },
      },
    });

    expect(queries.queryByRole("link", { name: /^Almanac/ })).toBeNull();
  });

  it("localizes the active and completed group labels and heading", () => {
    const { queries } = renderToFragment(CategoryGrid, {
      props: { progress: oneActiveOneComplete },
    });

    expect(queries.getByRole("list", { name: "To do categories" })).toBeTruthy();
    expect(queries.getByRole("list", { name: "Completed categories" })).toBeTruthy();
    expect(queries.getByRole("heading", { name: "To do" })).toBeTruthy();
    expect(queries.getByRole("heading", { name: "Completed" })).toBeTruthy();
  });

  it.each([
    { completed: 1686, completedShown: 1686, todo: 114, total: 1800, waiting: 0, width: 5 },
    { completed: 12_345, completedShown: 12_345, todo: 0, total: 12_345, waiting: 0, width: 6 },
    { completed: 1, completedShown: 1, todo: 1, total: 1_000_000, waiting: 0, width: 9 },
  ])(
    "shares enough count space across active and completed stripes: $width ch",
    ({ width, ...almanac }) => {
      const { queries } = renderToFragment(CategoryGrid, {
        props: { progress: { ...allComplete, almanac } },
      });

      for (const link of queries.getAllByRole("link")) {
        expect(link.parentElement?.closest("[style]")?.getAttribute("style")).toContain(
          `--category-count-width: ${width}ch`,
        );
      }
    },
  );

  it("localizes the completed heading and label for Japanese", () => {
    overwriteGetLocale(() => "ja");

    const { queries } = renderToFragment(CategoryGrid, { props: { progress: allComplete } });

    expect(queries.getByRole("list", { name: "完了済みのカテゴリー" })).toBeTruthy();
    expect(queries.getByRole("heading", { name: "完了済み" })).toBeTruthy();
  });

  it("localizes the active and completed labels for Russian", () => {
    overwriteGetLocale(() => "ru");

    const { queries } = renderToFragment(CategoryGrid, {
      props: { progress: oneActiveOneComplete },
    });

    expect(queries.getByRole("list", { name: "Категории: Сделать" })).toBeTruthy();
    expect(queries.getByRole("list", { name: "Категории: Выполнено" })).toBeTruthy();
    expect(queries.getByRole("heading", { name: "Выполнено" })).toBeTruthy();
  });
});
