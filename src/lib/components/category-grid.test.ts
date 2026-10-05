import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import CategoryGrid from "#lib/components/category-grid.svelte";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

const complete = { completed: 2, filtered: 0, total: 2 };

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
  almanac: { completed: 1, filtered: 1, total: 2 },
};

describe("CategoryGrid", () => {
  const defaultGetLocale = getLocale;

  afterEach(() => {
    overwriteGetLocale(defaultGetLocale);
  });

  it("renders in-progress categories alphabetized by displayed name", () => {
    const { body } = render(CategoryGrid, {
      props: {
        progress: {
          almanac: { completed: 1, filtered: 1, total: 2 },
          animals: { completed: 0, filtered: 1, total: 2 },
          cosmetics: { completed: 1, filtered: 1, total: 2 },
          mines: { completed: 2, filtered: 0, total: 2 },
          museum: { completed: 1, filtered: 1, total: 2 },
          quests: { completed: 1, filtered: 1, total: 2 },
          recipes: { completed: 1, filtered: 1, total: 2 },
          renown: { completed: 1, filtered: 1, total: 2 },
          skills: { completed: 1, filtered: 1, total: 2 },
          villagers: { completed: 1, filtered: 1, total: 2 },
        },
      },
    });

    expect(body.indexOf(">Almanac<")).toBeLessThan(body.indexOf(">Animals<"));
    expect(body.indexOf(">Skills<")).toBeLessThan(body.indexOf(">Villagers<"));
  });

  it("localizes the active and completed group labels and heading", () => {
    const { body } = render(CategoryGrid, { props: { progress: oneActiveOneComplete } });

    expect(body).toContain('aria-label="Categories in progress"');
    expect(body).toContain('aria-label="Completed categories"');
    expect(body).toContain(">Completed<");
  });

  it("localizes the completed heading and label for Japanese", () => {
    overwriteGetLocale(() => "ja");

    const { body } = render(CategoryGrid, { props: { progress: allComplete } });

    expect(body).toContain('aria-label="完了済みのカテゴリー"');
    expect(body).toContain(">完了済み<");
  });

  it("localizes the active and completed labels for Russian", () => {
    overwriteGetLocale(() => "ru");

    const { body } = render(CategoryGrid, { props: { progress: oneActiveOneComplete } });

    expect(body).toContain('aria-label="Категории в процессе"');
    expect(body).toContain('aria-label="Выполненные категории"');
    expect(body).toContain(">Выполнено<");
  });
});
