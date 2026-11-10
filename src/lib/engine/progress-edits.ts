import { trackerData } from "#lib/data/index.js";
import { recordEntries } from "#lib/utils/record.js";

import { nextQuestState, seasonOrdinal } from "./domain-primitives.js";
import { PROGRESS_FIELD_SPECS } from "./progress-fields.js";
import { changedFacts, factKey } from "./provenance.js";
import { availableDefaultRecipeIds } from "./quest-rewards.js";
import { applyEngagementCascade, getSpouseId } from "./relationships.js";
import { appliedFact } from "./save-progress.js";

import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  QuestId,
  RecipeId,
  Season,
  SkillId,
  VillagerId,
  VillagerRelationship,
} from "#lib/types/tracker-data.js";
import type { ProgressState, QuestState } from "#lib/types/user-progress.js";

import type { ProgressListField } from "./progress-fields.js";
import type { FactProvenance, ProgressHistory } from "./provenance.js";

/** The outcome of one quest transition, enough to undo exactly that call. */
export interface QuestCompletion {
  newlyAdded: RecipeId[];
  previousState: QuestState;
}

function withMembership<T>(items: Set<T>, id: T, included: boolean): Set<T> {
  if (items.has(id) === included) return items;
  const next = new Set(items);
  if (included) next.add(id);
  else next.delete(id);
  return next;
}

export type CollectionItem<Field extends ProgressListField> =
  ProgressState[Field] extends Set<infer Item extends string> ? Item : never;

export function setCollectionMember<Field extends ProgressListField>(
  progress: ProgressState,
  field: Field,
  id: CollectionItem<Field>,
  included: boolean,
): ProgressState {
  const items: Set<string> = progress[field];
  return { ...progress, [field]: withMembership(items, id, included) };
}

export function setSimpleProgress<Field extends "childChoice" | "hasUpperFloor">(
  progress: ProgressState,
  field: Field,
  value: ProgressState[Field],
): ProgressState {
  return { ...progress, [field]: value };
}

export function setAnimalCosmetic(
  progress: ProgressState,
  animal: AnimalId,
  cosmetic: CosmeticId,
  included: boolean,
): ProgressState {
  const items = withMembership(progress.animalCosmetics[animal] ?? new Set(), cosmetic, included);
  return { ...progress, animalCosmetics: { ...progress.animalCosmetics, [animal]: items } };
}

export function setAnimalVariant(
  progress: ProgressState,
  animal: AnimalId,
  variant: AnimalVariantId,
  included: boolean,
): ProgressState {
  const items = withMembership(progress.animals[animal] ?? new Set(), variant, included);
  return { ...progress, animals: { ...progress.animals, [animal]: items } };
}

export function setBreakUpsDisabled(progress: ProgressState, value: boolean): ProgressState {
  const villagerRelationships = { ...progress.villagerRelationships };
  applyEngagementCascade(villagerRelationships, value);
  return { ...progress, breakUpsDisabled: value, villagerRelationships };
}

export function setVillagerRelationship(
  progress: ProgressState,
  id: VillagerId,
  relationship: VillagerRelationship,
): ProgressState {
  const oldSpouse = getSpouseId(progress.villagerRelationships);
  let villagerRelationships: ProgressState["villagerRelationships"];
  if (relationship === "undecided") {
    const { [id]: _removed, ...remaining } = progress.villagerRelationships;
    villagerRelationships = remaining;
  } else {
    villagerRelationships = { ...progress.villagerRelationships, [id]: relationship };
  }
  applyEngagementCascade(villagerRelationships, progress.breakUpsDisabled);
  const childChoice =
    oldSpouse === getSpouseId(villagerRelationships) ? progress.childChoice : "undeclared";
  return { ...progress, childChoice, villagerRelationships };
}

export function setHeartLevel(
  progress: ProgressState,
  id: VillagerId,
  level: number,
): ProgressState {
  return {
    ...progress,
    heartLevels: { ...progress.heartLevels, [id]: PROGRESS_FIELD_SPECS.heartLevels.clamp(level) },
  };
}

export function setSkillLevel(progress: ProgressState, id: SkillId, level: number): ProgressState {
  return {
    ...progress,
    skillLevels: { ...progress.skillLevels, [id]: PROGRESS_FIELD_SPECS.skillLevels.clamp(level) },
  };
}

export function setMineFloor(progress: ProgressState, floor: number): ProgressState {
  return { ...progress, mineFloor: PROGRESS_FIELD_SPECS.mineFloor.clamp(floor) };
}

export function setRenown(progress: ProgressState, level: number): ProgressState {
  return { ...progress, renown: PROGRESS_FIELD_SPECS.renown.clamp(level) };
}

export function setReachedSeason(progress: ProgressState, season: Season): ProgressState {
  if (seasonOrdinal(season) <= seasonOrdinal(progress.reachedSeason)) return progress;
  return { ...progress, reachedSeason: season };
}

export function setQuestState(
  progress: ProgressState,
  id: QuestId,
  state: QuestState,
): ProgressState {
  return { ...progress, questStates: { ...progress.questStates, [id]: state } };
}

export function completeQuestWithRecipes(
  progress: ProgressState,
  id: QuestId,
  recipes: readonly RecipeId[],
): { completion: QuestCompletion; progress: ProgressState } {
  const previousState = progress.questStates[id] ?? "none";
  const next = setQuestState(progress, id, nextQuestState(previousState));
  const newlyAdded =
    previousState === "obtained"
      ? [...new Set(recipes)].filter((recipe) => !progress.almanacRecipes.has(recipe))
      : [];
  if (newlyAdded.length > 0) {
    next.almanacRecipes = new Set([...progress.almanacRecipes, ...newlyAdded]);
  }
  return { completion: { newlyAdded, previousState }, progress: next };
}

export function undoQuestWithRecipes(
  progress: ProgressState,
  id: QuestId,
  { newlyAdded, previousState }: QuestCompletion,
): ProgressState {
  const next = setQuestState(progress, id, previousState);
  if (newlyAdded.length > 0) {
    next.almanacRecipes = new Set(progress.almanacRecipes);
    for (const recipe of newlyAdded) next.almanacRecipes.delete(recipe);
  }
  return next;
}

export function addStarterItems(progress: ProgressState): {
  keys: string[];
  progress: ProgressState;
} {
  const keys: string[] = [];
  function add<T>(items: Set<T>, id: T, key: string): void {
    if (items.has(id)) return;
    items.add(id);
    keys.push(key);
  }

  const cosmetics = new Set(progress.cosmetics);
  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    if (cosmetic.sources.some((source) => source.type === "default")) {
      add(cosmetics, id, factKey("cosmetics", id));
    }
  }

  const animals = { ...progress.animals };
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    const variants = new Set(animals[animalId]);
    for (const tier of animal.variantTiers) {
      for (const [id, variant] of recordEntries(tier)) {
        if (variant.source.type === "default") add(variants, id, factKey("animals", animalId, id));
      }
    }
    animals[animalId] = variants;
  }

  const almanacRecipes = new Set(progress.almanacRecipes);
  for (const id of availableDefaultRecipeIds(
    (questId) => progress.questStates[questId] === "completed",
  )) {
    add(almanacRecipes, id, factKey("almanacRecipes", id));
  }
  return { keys, progress: { ...progress, almanacRecipes, animals, cosmetics } };
}

export function removeStarterItems(
  progress: ProgressState,
  keys: readonly string[],
): ProgressState {
  if (keys.length === 0) return progress;
  const removed = new Set(keys);
  const cosmetics = new Set(
    [...progress.cosmetics].filter((id) => !removed.has(factKey("cosmetics", id))),
  );
  const animals = { ...progress.animals };
  for (const [animalId, variants] of recordEntries(animals)) {
    animals[animalId] = new Set(
      [...variants].filter((id) => !removed.has(factKey("animals", animalId, id))),
    );
  }
  const almanacRecipes = new Set(
    [...progress.almanacRecipes].filter((id) => !removed.has(factKey("almanacRecipes", id))),
  );
  return { ...progress, almanacRecipes, animals, cosmetics };
}

/** Diff the entire edit, including cascades, reversals, and inferred batches. */
export function editProvenance(
  history: Readonly<ProgressHistory>,
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  primary: string | undefined,
  playtime: number | undefined,
): [string, FactProvenance][] {
  return changedFacts(before, after).map((key) => {
    const source = key === primary ? "manual" : "inferred";
    return [
      key,
      appliedFact(history.provenance[key], source, playtime, before.get(key), after.get(key)),
    ];
  });
}
