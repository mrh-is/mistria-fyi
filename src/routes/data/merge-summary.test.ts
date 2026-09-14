import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { userState } from "$lib/stores/user-state.svelte.js";

import MergeSummary from "./merge-summary.svelte";

import type { CompletedState, MergeCounts } from "$lib/stores/user-state.svelte.js";

const CASES: { expected: string; imported: Partial<CompletedState> }[] = [
  { expected: "Child choice updated", imported: { childChoice: "yes" } },
  { expected: "Dates: +1", imported: { dates: new Set(["review-date" as never]) } },
  { expected: "Upper floor unlocked", imported: { hasUpperFloor: true } },
  {
    expected: "NPC relationships: +1",
    imported: { npcRelationships: { ["adeline" as never]: "romantic" } },
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
  for (const { expected, imported } of CASES) {
    it(`reports ${expected} after an actual merge`, () => {
      const counts = userState.mergeFromSave(imported);

      assertSummary("import", counts, expected);
      assertSummary("transfer", counts, expected);
    });
  }
});

function assertSummary(kind: "import" | "transfer", counts: MergeCounts, expected: string): void {
  const { body } = render(MergeSummary, { props: { counts, filesUsed: ["player.json"], kind } });

  expect(body).toContain(expected);
  expect(body).not.toContain("No new data to import");
  expect(body).not.toContain("no new items to add");
}
