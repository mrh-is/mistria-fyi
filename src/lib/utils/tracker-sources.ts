import type { Source } from "$lib/types/acquisition.js";
import type { TrackerData } from "$lib/types/tracker-data.js";

export function allTrackerSources(data: TrackerData): Source[] {
  const sources: Source[] = [];

  for (const entity of Object.values(data.items)) sources.push(...entity.sources);
  for (const entity of Object.values(data.recipes)) sources.push(...entity.sources);
  for (const entity of Object.values(data.cosmetics)) sources.push(...entity.sources);
  for (const entity of Object.values(data.dates)) sources.push(...entity.sources);
  for (const entity of Object.values(data.mines.spells)) sources.push(...entity.sources);
  for (const entity of Object.values(data.pets.cosmetics)) sources.push(...entity.sources);
  for (const entity of Object.values(data.pets.skins)) sources.push(...entity.sources);

  for (const animal of Object.values(data.animals)) {
    for (const tier of animal.variantTiers) {
      for (const variant of Object.values(tier)) sources.push(variant.source);
    }
    for (const cosmetic of Object.values(animal.cosmetics)) sources.push(...cosmetic.sources);
  }

  for (const quest of Object.values(data.quests.fetch)) {
    sources.push(...data.items[quest.itemId].sources);
  }
  for (const quest of Object.values(data.quests.cooking)) {
    sources.push(...data.recipes[quest.recipeId].sources);
  }

  return sources;
}
