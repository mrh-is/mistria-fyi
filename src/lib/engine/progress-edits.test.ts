import { expect, it } from "vitest";

import {
  addStarterItems,
  completeQuestWithRecipes,
  editProvenance,
  removeStarterItems,
  setAnimalVariant,
  setBreakUpsDisabled,
  setHeartLevel,
  setMineFloor,
  setReachedSeason,
  setRenown,
  setSkillLevel,
  setVillagerRelationship,
  undoQuestWithRecipes,
} from "./progress-edits.js";
import { createDefaultProgress } from "./progress-fields.js";
import {
  getMaxMineFloor,
  getMaxRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "./progress.js";
import { progressFacts } from "./provenance.js";

import type {
  AnimalId,
  AnimalVariantId,
  QuestId,
  RecipeId,
  SkillId,
  VillagerId,
} from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";

import type { ProgressHistory } from "./provenance.js";

const ADELINE = "adeline" as VillagerId;
const CELINE = "celine" as VillagerId;
const FARMING = "farming" as SkillId;

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

it.each([false, true])(
  "marries and resets child choice with break-ups disabled = %s",
  (disabled) => {
    const before = createDefaultProgress(Set, []);
    before.breakUpsDisabled = disabled;
    before.childChoice = "yes";
    before.villagerRelationships[CELINE] = "romantic";

    const after = setVillagerRelationship(before, ADELINE, "married");

    expect(after.childChoice).toBe("undeclared");
    expect(after.villagerRelationships).toEqual({
      [ADELINE]: "married",
      [CELINE]: disabled ? "romantic" : "platonic",
    });
    expect(before.childChoice).toBe("yes");
    expect(before.villagerRelationships).toEqual({ [CELINE]: "romantic" });
  },
);

it.each([
  { choice: "undeclared", id: ADELINE, remaining: { [CELINE]: "romantic" } },
  { choice: "yes", id: CELINE, remaining: { [ADELINE]: "married" } },
])(
  "removes an undecided relationship and leaves child choice $choice",
  ({ choice, id, remaining }) => {
    const before = createDefaultProgress(Set, []);
    before.breakUpsDisabled = true;
    before.childChoice = "yes";
    before.villagerRelationships = { [ADELINE]: "married", [CELINE]: "romantic" };

    const after = setVillagerRelationship(before, id, "undecided");

    expect(after.villagerRelationships).toEqual(remaining);
    expect(after.childChoice).toBe(choice);
    expect(before.villagerRelationships).toEqual({ [ADELINE]: "married", [CELINE]: "romantic" });
  },
);

it("ends other romances when break-ups are re-enabled without changing the existing spouse", () => {
  const before = createDefaultProgress(Set, []);
  before.breakUpsDisabled = true;
  before.childChoice = "yes";
  before.villagerRelationships = { [ADELINE]: "married", [CELINE]: "romantic" };

  const after = setBreakUpsDisabled(before, false);

  expect(after.breakUpsDisabled).toBe(false);
  expect(after.childChoice).toBe("yes");
  expect(after.villagerRelationships).toEqual({ [ADELINE]: "married", [CELINE]: "platonic" });
  expect(before.breakUpsDisabled).toBe(true);
  expect(before.villagerRelationships[CELINE]).toBe("romantic");
});

it("reports only newly added starter items and removes only the requested keys", () => {
  const ownedRecipe = "basic_wood_chest" as RecipeId;
  const ownedFact = "almanacRecipes/basic_wood_chest";
  const before = createDefaultProgress(Set, []);
  before.almanacRecipes.add(ownedRecipe);

  const { keys, progress } = addStarterItems(before);
  const facts = progressFacts(progress);
  expect(progressFacts(before)).toEqual(new Map([[ownedFact, "1"]]));
  expect(facts.has(ownedFact)).toBe(true);
  expect(keys).toHaveLength(facts.size - 1);
  expect(new Set(keys)).toEqual(new Set([...facts.keys()].filter((key) => key !== ownedFact)));

  const removed = ["almanacRecipes/", "animals/", "cosmetics/"].flatMap((prefix) =>
    keys.filter((key) => key.startsWith(prefix)).slice(0, 1),
  );
  expect(removed).toHaveLength(3);
  expect(keys.length).toBeGreaterThan(removed.length);
  expect(progressFacts(removeStarterItems(progress, removed))).toEqual(
    new Map([...facts].filter(([key]) => !removed.includes(key))),
  );
  expect(progressFacts(progress)).toEqual(facts);
});

const LEVEL_EDITS = [
  [
    "heart level",
    (progress, value) => setHeartLevel(progress, ADELINE, value).heartLevels[ADELINE],
    MAX_HEART_LEVEL,
  ],
  [
    "skill level",
    (progress, value) => setSkillLevel(progress, FARMING, value).skillLevels[FARMING],
    MAX_SKILL_LEVEL,
  ],
  ["mine floor", (progress, value) => setMineFloor(progress, value).mineFloor, getMaxMineFloor()],
  ["renown", (progress, value) => setRenown(progress, value).renown, getMaxRenownLevel()],
] satisfies [string, (progress: ProgressState, value: number) => number | undefined, number][];

it.each(LEVEL_EDITS)("bounds the %s and leaves the input untouched", (_name, edit, max) => {
  const before = createDefaultProgress(Set, []);

  expect(edit(before, max + 1)).toBe(max);
  expect(edit(before, -1)).toBe(0);
  expect(edit(before, 3.9)).toBe(3);
  expect(before).toEqual(createDefaultProgress(Set, []));
});

it.each([
  ["spring", "fall"],
  ["fall", "fall"],
  ["winter", "winter"],
] as const)("keeps reached season monotonic when setting %s from fall", (requested, expected) => {
  const before = createDefaultProgress(Set, []);
  before.reachedSeason = "fall";

  expect(setReachedSeason(before, requested).reachedSeason).toBe(expected);
  expect(before.reachedSeason).toBe("fall");
});

it.each([
  { primary: "questStates/example_quest", source: "manual" },
  { primary: undefined, source: "inferred" },
])(
  "records the quest transition as $source and infers the other changed facts",
  ({ primary, source }) => {
    const quest = "questStates/example_quest";
    const reward = "almanacRecipes/new_recipe";
    const removed = "almanac/turnip";
    const unchanged = "almanac/potato";
    const history: ProgressHistory = {
      provenance: { [quest]: { source: "save" } },
      resolutions: {},
    };
    const before = new Map([
      [quest, "obtained"],
      [removed, "1"],
      [unchanged, "1"],
    ]);
    const after = new Map([
      [quest, "completed"],
      [reward, "1"],
      [unchanged, "1"],
    ]);

    expect(Object.fromEntries(editProvenance(history, before, after, primary, 120))).toEqual({
      [quest]: { obtainedSource: "save", playtime: 120, source },
      [removed]: { playtime: 120, source: "inferred" },
      [reward]: { playtime: 120, source: "inferred" },
    });
    expect(history.provenance).toEqual({ [quest]: { source: "save" } });
  },
);
