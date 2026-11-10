/**
 * The words for a question a save asks: what to call the field it's about, & what each answer says.
 * A question names a category of the tracker rather than each fact, so it stays one sentence.
 */
import { categoryNameForKey } from "#lib/data/categories.js";

import type { CategoryKey } from "#lib/engine/categories.js";
import type { AskReason, FactsQuestion, SyncField } from "#lib/engine/sync-apply.js";
import type { LocaleCode } from "#lib/types/locale.js";

/** The category each field shows in. `null` is about the farm itself, which has no category. */
export const FIELD_CATEGORIES: Readonly<Record<FactsQuestion["field"], CategoryKey | null>> = {
  almanac: "almanac",
  almanacRecipes: "recipes",
  animalCosmetics: "animals",
  animals: "animals",
  breakUpsDisabled: "villagers",
  childChoice: "villagers",
  cosmetics: "cosmetics",
  hasUpperFloor: null,
  heartLevels: "villagers",
  household: "villagers",
  mineFloor: "mines",
  mountAppearances: "animals",
  museum: "museum",
  petCosmetics: "animals",
  petSkins: "animals",
  questStates: "quests",
  reachedSeason: null,
  renown: "renown",
  skillLevels: "skills",
  spells: "mines",
  unlockedPerks: "skills",
  villagerRelationships: "villagers",
} satisfies Record<"household" | SyncField, CategoryKey | null>;

const REASON_BODIES: Readonly<Record<AskReason, (field: string, locale: LocaleCode) => string>> = {
  "level-decrease": (field, _locale) =>
    `${field}: Your save file has lower levels than this device.`,
  "local-disagrees": (field, _locale) =>
    `${field}: Your save file doesn’t match what’s on this device, and we can’t tell which is newer.`,
  "many-removals": (field, _locale) =>
    `${field}: Your save file would take back a lot at once. That can happen after a game update, so we wanted to check.`,
};

/** One sentence naming what a facts question is about & why it asks. */
export function factsQuestionBody(question: FactsQuestion, _locale: LocaleCode): string {
  const category = FIELD_CATEGORIES[question.field];
  const field = category ? categoryNameForKey(category, _locale) : "Your farm";
  return REASON_BODIES[question.reason](field, _locale);
}
