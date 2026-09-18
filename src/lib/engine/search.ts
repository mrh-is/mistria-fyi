import { trackerData, trackerIndex } from "$lib/data/index.js";
import { animalNameId, getName, nameCollator } from "$lib/data/names.js";
import { isItemApplicable, isItemApplicableForAlmanac } from "$lib/engine/applicability.js";
import { isItemAvailable } from "$lib/engine/availability.js";
import { isNpcComplete } from "$lib/engine/progress.js";
import { isVisible } from "$lib/engine/visibility.js";
import { recordEntries } from "$lib/utils";

import type { UserProgressionState } from "$lib/engine/visibility.js";
import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type { ItemId, QuestId, Season, Weather } from "$lib/types/tracker-data.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface SearchResult {
  available: boolean;
  category: string;
  completed: boolean;
  detail?: string;
  fullName?: string;
  id: string;
  name: string;
}

const MAX_RESULTS = 50;

// ─── Search ─────────────────────────────────────────────────────────

export function searchItems(
  query: string,
  completed: CompletedState,
  worldState: { season: Season; weather: Weather },
  progressionState: UserProgressionState,
  locale: LocaleCode,
): SearchResult[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  // Almanac entries — one result per collapsed row, canonical ID
  const seenAlmanacIds = new Set<ItemId>();
  for (const entry of trackerIndex.almanacEntries) {
    const canonicalId = entry.itemIds[0];
    if (seenAlmanacIds.has(canonicalId)) continue;
    seenAlmanacIds.add(canonicalId);
    const item = trackerData.items[canonicalId];
    if (item.visibility && !isVisible(item.visibility, progressionState)) continue;
    if (!isItemApplicableForAlmanac(entry.itemIds, completed)) continue;

    const name = getName("items", canonicalId, locale);
    const englishName = getName("items", canonicalId, "en");
    if (name.toLowerCase().includes(q) || englishName.toLowerCase().includes(q)) {
      results.push({
        available: isItemAvailable(
          trackerIndex.getAggregatedAlmanacSources(canonicalId),
          worldState,
          "available",
        ),
        category: "almanac",
        completed: completed.almanac.has(canonicalId),
        id: canonicalId,
        name,
      });
    }
  }

  // Museum items — these use raw item IDs, not almanac entries
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const id of set.items) {
        const item = trackerData.items[id];
        if (item.visibility && !isVisible(item.visibility, progressionState)) continue;
        if (!isItemApplicable(id, completed)) continue;

        const name = getName("items", id, locale);
        const englishName = getName("items", id, "en");
        if (name.toLowerCase().includes(q) || englishName.toLowerCase().includes(q)) {
          // Skip if already covered by an almanac result with same ID
          if (results.some((r) => r.id === id && r.category === "almanac")) continue;
          results.push({
            available: isItemAvailable(item.sources, worldState, "available"),
            category: "museum",
            completed: completed.museum.has(id),
            id,
            name,
          });
        }
      }
    }
  }

  // NPCs — not season-gated. Matched on the localized name, then on the English name as a
  // fallback, so an English query still finds an NPC while browsing a non-Latin locale.
  for (const [id] of recordEntries(trackerData.npcs)) {
    const npcVis = trackerData.npcs[id].visibility;
    if (npcVis && !isVisible(npcVis, progressionState)) continue;

    const localizedName = getName("npcs", id, locale);
    const englishName = getName("npcs", id, "en");

    if (localizedName.toLowerCase().includes(q) || englishName.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "npcs",
        completed: isNpcComplete(id, completed),
        id,
        name: localizedName,
      });
    }
  }

  // Animal variants — not season-gated
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    if (animal.visibility && !isVisible(animal.visibility, progressionState)) continue;

    for (const tier of animal.variantTiers) {
      for (const [variantId] of recordEntries(tier)) {
        const name = getName("animals", animalNameId(animalId, "variants", variantId), locale);
        const englishName = getName("animals", animalNameId(animalId, "variants", variantId), "en");
        if (name.toLowerCase().includes(q) || englishName.toLowerCase().includes(q)) {
          results.push({
            available: true,
            category: "animals",
            completed: completed.animals[animalId].has(variantId),
            detail: getName("animals", animalNameId(animalId, "core"), locale),
            id: `${animalId}:${variantId}`,
            name,
          });
        }
      }
    }
  }

  // Animal cosmetics — not season-gated
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    if (animal.visibility && !isVisible(animal.visibility, progressionState)) continue;

    for (const [cosmeticId] of recordEntries(animal.cosmetics)) {
      const name = getName("animals", animalNameId(animalId, "cosmetics", cosmeticId), locale);
      const englishName = getName("animals", animalNameId(animalId, "cosmetics", cosmeticId), "en");
      const fullName = `${getName("animals", animalNameId(animalId, "core"), locale)} ${name}`;
      const englishFullName = `${getName("animals", animalNameId(animalId, "core"), "en")} ${englishName}`;
      if (fullName.toLowerCase().includes(q) || englishFullName.toLowerCase().includes(q)) {
        results.push({
          available: true,
          category: "animals",
          completed: completed.animalCosmetics[animalId].has(cosmeticId),
          fullName,
          id: `${animalId}:${cosmeticId}`,
          name,
        });
      }
    }
  }

  // Pet cosmetics
  for (const [id] of recordEntries(trackerData.pets.cosmetics)) {
    const name = getName("pets/cosmetic_sets", id, locale);
    if (name.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "animals",
        completed: completed.petCosmetics.has(id),
        fullName: name,
        id: `pet-cosmetic:${id}`,
        name,
      });
    }
  }

  // Pet skins
  for (const [id] of recordEntries(trackerData.pets.skins)) {
    const name = getName("pets/skins", id, locale);
    const englishName = getName("pets/skins", id, "en");
    if (name.toLowerCase().includes(q) || englishName.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "animals",
        completed: completed.petSkins.has(id),
        fullName: name,
        id: `pet-skin:${id}`,
        name,
      });
    }
  }

  // Recipes — gated by recipe visibility, not item visibility
  for (const [id, recipe] of recordEntries(trackerData.recipes)) {
    if (recipe.visibility && !isVisible(recipe.visibility, progressionState)) continue;

    const name = getName("recipes", id, locale);
    const englishName = getName("recipes", id, "en");
    if (name.toLowerCase().includes(q) || englishName.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "recipes",
        completed: completed.almanacRecipes.has(id),
        id,
        name,
      });
    }
  }

  // Cosmetics — not season-gated
  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    if (cosmetic.visibility && !isVisible(cosmetic.visibility, progressionState)) continue;

    const name = getName("cosmetics", id, locale);
    const englishName = getName("cosmetics", id, "en");
    if (name.toLowerCase().includes(q) || englishName.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "cosmetics",
        completed: completed.cosmetics.has(id),
        id,
        name,
      });
    }
  }

  // Quests — not season-gated
  const pregnancyQuestIds = new Set(
    Object.values(trackerData.pregnancyQuestByNpc).filter((id): id is QuestId => id !== undefined),
  );
  for (const [, quests] of recordEntries(trackerData.quests)) {
    for (const [id, quest] of recordEntries(quests)) {
      if (pregnancyQuestIds.has(id)) continue;
      if (quest.visibility && !isVisible(quest.visibility, progressionState)) continue;

      const name = getName("quests", id, locale);
      if (name.toLowerCase().includes(q)) {
        results.push({
          available: true,
          category: "quests",
          completed: completed.questStates[id] === "completed",
          id,
          name,
        });
      }
    }
  }

  return rankResults(results, q, locale).slice(0, MAX_RESULTS);
}

/** Prefix matches first, then available before unavailable, then alphabetical */
function rankResults(results: SearchResult[], query: string, locale: LocaleCode): SearchResult[] {
  const collator = nameCollator(locale);
  return results.sort((a, b) => {
    const aName = (a.fullName ?? a.name).toLowerCase();
    const bName = (b.fullName ?? b.name).toLowerCase();
    const aPrefix = aName.startsWith(query) ? 0 : 1;
    const bPrefix = bName.startsWith(query) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    if (a.available !== b.available) return a.available ? -1 : 1;
    return collator.compare(aName, bName);
  });
}
