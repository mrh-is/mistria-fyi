import { afterEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import MergeSummary from "./merge-summary.svelte";

import type { CompletedState } from "#lib/stores/user-state.svelte.js";
import type { VillagerId } from "#lib/types/tracker-data.js";

const CASES: { expected: string; imported: Partial<CompletedState>; setup?: () => void }[] = [
  {
    expected: "Child choice updated",
    imported: { childChoice: "yes" },
    setup: () => {
      userState.setVillagerRelationship("adeline" as VillagerId, "married");
    },
  },
  { expected: "Dates: +1", imported: { dates: new Set(["review-date" as never]) } },
  { expected: "Upper floor unlocked", imported: { hasUpperFloor: true } },
  {
    expected: "Villager relationships: +1",
    imported: { villagerRelationships: { ["adeline" as never]: "romantic" } },
  },
  { expected: "Perks: +1", imported: { unlockedPerks: new Set(["review-perk" as never]) } },
  { expected: "Season progression updated", imported: { reachedSeason: "summer" } },
  {
    expected: "Recipes: +1",
    imported: { almanacRecipes: new Set(["review-recipe" as never]) },
  },
];

afterEach(() => {
  userState.resetAll();
});

describe("merge summary integration", () => {
  it.each(CASES)("reports $expected after an actual merge", ({ expected, imported, setup }) => {
    setup?.();
    const { counts } = userState.mergeFromSave(imported);

    for (const kind of ["import", "transfer"] as const) {
      const { text } = renderToFragment(MergeSummary, {
        props: { counts, filesUsed: ["player.json"], kind },
      });

      expect(text).toContain(expected);
      expect(text).not.toContain("No new data to import");
      expect(text).not.toContain("no new items to add");
    }
  });
});

describe("merge summary household conflicts", () => {
  it("renders a spouse conflict with both villager names and a correction link", () => {
    userState.setVillagerRelationship("adeline" as VillagerId, "married");
    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { ["balor" as VillagerId]: "married" },
    });

    const { container, text } = renderToFragment(MergeSummary, {
      props: { conflicts, counts, kind: "transfer" },
    });

    expect(text).toContain("Adeline");
    expect(text).toContain("Balor");
    const link = container.querySelector("a[href$='/villagers']");
    expect(link?.textContent).toContain("Correct this manually");
  });

  it("renders a child-choice conflict", () => {
    userState.setVillagerRelationship("adeline" as VillagerId, "married");
    userState.setChildChoice("yes");
    const { conflicts, counts } = userState.mergeFromSave({
      childChoice: "no",
      villagerRelationships: { ["adeline" as VillagerId]: "married" },
    });

    const { text } = renderToFragment(MergeSummary, {
      props: { conflicts, counts, kind: "transfer" },
    });

    expect(text).toContain("Adeline");
    expect(text).toContain("Kids");
    expect(text).toContain("Child-free");
  });
});
