import { render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import MergeSummary from "./merge-summary.svelte";

import type { VillagerId } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";

const CASES: { expected: string; imported: Partial<ProgressState>; setup?: () => void }[] = [
  {
    expected: "Child choice updated",
    imported: { childChoice: "yes" },
    setup: () => {
      userState.setVillagerRelationship("adeline" as VillagerId, "married");
    },
  },
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

beforeEach(() => {
  userState.loadFromStorage();
  userState.resetAll();
});

afterEach(() => {
  userState.resetAll();
});

describe("merge summary integration", () => {
  it.each(CASES)(
    "reports $expected after an actual merge",
    async ({ expected, imported, setup }) => {
      setup?.();
      const outcome = await userState.mergeFromSave(imported);
      if (outcome.kind !== "applied") throw new Error(`Import returned ${outcome.kind}`);
      const { counts } = outcome.result;

      const { container } = render(MergeSummary, {
        props: { counts, filesUsed: ["player.json"] },
      });

      expect(container).toHaveTextContent(expected);
      expect(container).not.toHaveTextContent("No new data to import");
    },
  );
});

describe("merge summary household conflicts", () => {
  it("renders a spouse conflict with both villager names and a correction link", async () => {
    userState.setVillagerRelationship("adeline" as VillagerId, "married");
    const outcome = await userState.mergeFromSave({
      villagerRelationships: { ["balor" as VillagerId]: "married" },
    });
    if (outcome.kind !== "applied") throw new Error(`Import returned ${outcome.kind}`);
    const { conflicts, counts } = outcome.result;

    const { container } = render(MergeSummary, {
      props: { conflicts, counts },
    });

    expect(container).toHaveTextContent("Adeline");
    expect(container).toHaveTextContent("Balor");
    const link = container.querySelector("a[href$='/villagers']");
    expect(link?.textContent).toContain("Correct this manually");
  });

  it("renders a child-choice conflict", async () => {
    userState.setVillagerRelationship("adeline" as VillagerId, "married");
    userState.setChildChoice("yes");
    const outcome = await userState.mergeFromSave({
      childChoice: "no",
      villagerRelationships: { ["adeline" as VillagerId]: "married" },
    });
    if (outcome.kind !== "applied") throw new Error(`Import returned ${outcome.kind}`);
    const { conflicts, counts } = outcome.result;

    const { container } = render(MergeSummary, {
      props: { conflicts, counts },
    });

    expect(container).toHaveTextContent("Adeline");
    expect(container).toHaveTextContent("Kids");
    expect(container).toHaveTextContent("Child-free");
  });
});
