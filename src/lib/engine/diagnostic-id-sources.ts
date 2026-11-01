/** Every source of public unknown IDs must be classified here before the extractor can use it. */
export const DIAGNOSTIC_ID_SOURCES = [
  "player.items_acquired",
  "player.recipe_unlocks",
  "player.cosmetic_unlocks",
  "player.pet_cosmetic_sets_unlocked",
  "player.pet_skin_unlocks",
  "player.spells_learned",
  "player.perks",
  "gamedata.museum_progress",
  "quests.completed_quests",
  "quests.active_quests",
  "player.animal_variant_unlocks",
  "player.animal_cosmetic_unlocks",
] as const;

export type DiagnosticIdSource =
  | (typeof DIAGNOSTIC_ID_SOURCES)[number]
  | `player.animal_cosmetic_unlocks.${string}`
  | `player.animal_variant_unlocks.${string}`;

export function isDiagnosticIdSource(path: string): path is DiagnosticIdSource {
  return (
    DIAGNOSTIC_ID_SOURCES.some((source) => source === path) ||
    /^player\.animal_(?:variant|cosmetic)_unlocks\.[^.]+$/u.test(path)
  );
}
