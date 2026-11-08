import { expect, it } from "vitest";

import {
  completeQuestWithRecipes,
  setAnimalVariant,
  undoQuestWithRecipes,
} from "./progress-edits.js";
import { createDefaultProgress } from "./progress-fields.js";

import type { AnimalId, AnimalVariantId, QuestId, RecipeId } from "#lib/types/tracker-data.js";

it("changes an animal's collection without changing the input or the other collections", () => {
  const animal = "chicken" as AnimalId;
  const variant = "red" as AnimalVariantId;
  const before = createDefaultProgress(Set, [animal]);
  const after = setAnimalVariant(before, animal, variant, true);
  const removed = setAnimalVariant(after, animal, variant, false);

  expect(before.animals[animal]).toEqual(new Set());
  expect(after.animals[animal]).toEqual(new Set([variant]));
  expect(removed.animals[animal]).toEqual(new Set());
  expect(after.almanac).toBe(before.almanac);
});

it("completes and undoes a quest using separate snapshots and only its newly added rewards", () => {
  const quest = "example_quest" as QuestId;
  const known = "known_recipe" as RecipeId;
  const reward = "new_recipe" as RecipeId;
  const before = createDefaultProgress(Set, []);
  before.questStates[quest] = "obtained";
  before.almanacRecipes.add(known);

  const { completion, progress: after } = completeQuestWithRecipes(before, quest, [known, reward]);
  const undone = undoQuestWithRecipes(after, quest, completion);

  expect(before.questStates[quest]).toBe("obtained");
  expect(before.almanacRecipes).toEqual(new Set([known]));
  expect(after.questStates[quest]).toBe("completed");
  expect(after.almanacRecipes).toEqual(new Set([known, reward]));
  expect(undone).toEqual(before);
});
