import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import CategoryGrid from "$lib/components/category-grid.svelte";

describe("CategoryGrid", () => {
  it("renders in-progress categories alphabetized by displayed name", () => {
    const { body } = render(CategoryGrid, {
      props: {
        progress: {
          almanac: { completed: 1, filtered: 1, total: 2 },
          animals: { completed: 0, filtered: 1, total: 2 },
          cosmetics: { completed: 1, filtered: 1, total: 2 },
          mines: { completed: 2, filtered: 0, total: 2 },
          museum: { completed: 1, filtered: 1, total: 2 },
          npcs: { completed: 1, filtered: 1, total: 2 },
          quests: { completed: 1, filtered: 1, total: 2 },
          recipes: { completed: 1, filtered: 1, total: 2 },
          renown: { completed: 1, filtered: 1, total: 2 },
          skills: { completed: 1, filtered: 1, total: 2 },
        },
      },
    });

    expect(body.indexOf(">Animals<")).toBeLessThan(body.indexOf(">Cosmetics<"));
    expect(body.indexOf(">Skills<")).toBeLessThan(body.indexOf(">The Almanac<"));
    expect(body.indexOf(">The Museum<")).toBeLessThan(body.indexOf(">Villagers<"));
  });
});
