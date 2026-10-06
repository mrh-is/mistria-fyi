import { afterEach, describe, expect, it } from "vitest";

import CategoryGrid from "#lib/components/category-grid.svelte";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

const complete = { completed: 2, remainingInScope: 0, total: 2 };

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
  almanac: { completed: 1, remainingInScope: 1, total: 2 },
};

describe("CategoryGrid", () => {
  const defaultGetLocale = getLocale;

  afterEach(() => {
    overwriteGetLocale(defaultGetLocale);
  });

  it("renders in-progress categories alphabetized by displayed name", () => {
    const { queries } = renderToFragment(CategoryGrid, {
      props: {
        progress: {
          almanac: { completed: 1, remainingInScope: 1, total: 2 },
          animals: { completed: 0, remainingInScope: 1, total: 2 },
          cosmetics: { completed: 1, remainingInScope: 1, total: 2 },
          mines: { completed: 2, remainingInScope: 0, total: 2 },
          museum: { completed: 1, remainingInScope: 1, total: 2 },
          quests: { completed: 1, remainingInScope: 1, total: 2 },
          recipes: { completed: 1, remainingInScope: 1, total: 2 },
          renown: { completed: 1, remainingInScope: 1, total: 2 },
          skills: { completed: 1, remainingInScope: 1, total: 2 },
          villagers: { completed: 1, remainingInScope: 1, total: 2 },
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

  it("localizes the active and completed group labels and heading", () => {
    const { queries } = renderToFragment(CategoryGrid, {
      props: { progress: oneActiveOneComplete },
    });

    expect(queries.getByRole("list", { name: "Categories in progress" })).toBeTruthy();
    expect(queries.getByRole("list", { name: "Completed categories" })).toBeTruthy();
    expect(queries.getByRole("heading", { name: "Completed" })).toBeTruthy();
  });

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

    expect(queries.getByRole("list", { name: "Категории в процессе" })).toBeTruthy();
    expect(queries.getByRole("list", { name: "Выполненные категории" })).toBeTruthy();
    expect(queries.getByRole("heading", { name: "Выполнено" })).toBeTruthy();
  });
});
