import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

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
      const { body } = render(MergeSummary, {
        props: { counts, filesUsed: ["player.json"], kind },
      });

      expect(body).toContain(expected);
      expect(body).not.toContain("No new data to import");
      expect(body).not.toContain("no new items to add");
    }
  });
});

describe("merge summary household conflicts", () => {
  it("renders a spouse conflict with both villager names and a correction link", () => {
    userState.setVillagerRelationship("adeline" as VillagerId, "married");
    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { ["balor" as VillagerId]: "married" },
    });

    const { body } = render(MergeSummary, { props: { conflicts, counts, kind: "transfer" } });

    expect(body).toContain("Adeline");
    expect(body).toContain("Balor");
    expect(body).toContain("Correct this manually");
    expect(body).toContain("/villagers");
  });

  it("renders a child-choice conflict", () => {
    userState.setVillagerRelationship("adeline" as VillagerId, "married");
    userState.setChildChoice("yes");
    const { conflicts, counts } = userState.mergeFromSave({
      childChoice: "no",
      villagerRelationships: { ["adeline" as VillagerId]: "married" },
    });

    const { body } = render(MergeSummary, { props: { conflicts, counts, kind: "transfer" } });

    expect(body).toContain("Adeline");
    expect(body).toContain("Kids");
    expect(body).toContain("Child-free");
  });
});
