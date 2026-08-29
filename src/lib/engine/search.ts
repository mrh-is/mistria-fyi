import { trackerData } from "$lib/data/index.js";
import { isItemAvailable } from "$lib/engine/availability.js";
import { isVisible } from "$lib/engine/visibility.js";
import { recordEntries } from "$lib/utils";

import type { UserProgressionState } from "$lib/engine/visibility.js";
import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { Source } from "$lib/types/acquisition.js";
import type { ItemId, Season, Weather } from "$lib/types/tracker-data.js";

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
): SearchResult[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  // Almanac entries — one result per collapsed row, canonical ID
  for (const category of Object.values(trackerData.almanac)) {
    for (const entry of category.items) {
      const canonicalId = entry.itemIds[0];
      const item = trackerData.items[canonicalId];
      if (item.visibility && !isVisible(item.visibility, progressionState)) continue;

      if (entry.name.toLowerCase().includes(q)) {
        const sources = aggregateSources(entry.itemIds);
        results.push({
          available: isItemAvailable(sources, worldState, "available"),
          category: "almanac",
          completed: completed.almanac.has(canonicalId),
          id: canonicalId,
          name: entry.name,
        });
      }
      if (results.length >= MAX_RESULTS) return rankResults(results, q);
    }
  }

  // Museum items — these use raw item IDs, not almanac entries
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const id of set.items) {
        const item = trackerData.items[id];
        if (item.visibility && !isVisible(item.visibility, progressionState)) continue;

        if (item.name.toLowerCase().includes(q)) {
          // Skip if already covered by an almanac result with same ID
          if (results.some((r) => r.id === id && r.category === "almanac")) continue;
          results.push({
            available: isItemAvailable(item.sources, worldState, "available"),
            category: "museum",
            completed: completed.museum.has(id),
            id,
            name: item.name,
          });
        }
        if (results.length >= MAX_RESULTS) return rankResults(results, q);
      }
    }
  }

  // NPCs — not season-gated
  for (const [id, npc] of recordEntries(trackerData.npcs)) {
    const npcVis = trackerData.npcs[id].visibility;
    if (npcVis && !isVisible(npcVis, progressionState)) continue;

    if (npc.name.toLowerCase().includes(q)) {
      const max = npc.dateable ? 12 : 10;
      results.push({
        available: true,
        category: "npcs",
        completed: (completed.npcLevels[id] ?? 0) >= max,
        id,
        name: npc.name,
      });
    }
    if (results.length >= MAX_RESULTS) return rankResults(results, q);
  }

  // Animal variants — not season-gated
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    if (animal.visibility && !isVisible(animal.visibility, progressionState)) continue;

    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier)) {
        if (variant.name.toLowerCase().includes(q)) {
          results.push({
            available: true,
            category: "animals",
            completed: completed.animals[animalId].has(variantId),
            detail: animal.name,
            id: `${animalId}:${variantId}`,
            name: variant.name,
          });
        }
      }
      if (results.length >= MAX_RESULTS) return rankResults(results, q);
    }
  }

  // Animal cosmetics — not season-gated
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    if (animal.visibility && !isVisible(animal.visibility, progressionState)) continue;

    for (const [cosmeticId, cosmetic] of recordEntries(animal.cosmetics)) {
      const fullName = `${animal.name} ${cosmetic.name}`;
      if (fullName.toLowerCase().includes(q)) {
        results.push({
          available: true,
          category: "animals",
          completed: completed.animalCosmetics[animalId].has(cosmeticId),
          fullName,
          id: `${animalId}:${cosmeticId}`,
          name: cosmetic.name,
        });
      }
      if (results.length >= MAX_RESULTS) return rankResults(results, q);
    }
  }

  // Pet cosmetics
  for (const [id, entry] of recordEntries(trackerData.pets.cosmetics)) {
    if (entry.name.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "animals",
        completed: completed.petCosmetics.has(id),
        fullName: entry.name,
        id: `pet-cosmetic:${id}`,
        name: entry.name,
      });
    }
    if (results.length >= MAX_RESULTS) return rankResults(results, q);
  }

  // Pet skins
  for (const [id, entry] of recordEntries(trackerData.pets.skins)) {
    if (entry.name.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "animals",
        completed: completed.petSkins.has(id),
        fullName: entry.name,
        id: `pet-skin:${id}`,
        name: entry.name,
      });
    }
    if (results.length >= MAX_RESULTS) return rankResults(results, q);
  }

  // Recipes — gated by recipe visibility, not item visibility
  for (const [id, recipe] of recordEntries(trackerData.recipes)) {
    if (recipe.visibility && !isVisible(recipe.visibility, progressionState)) continue;

    if (recipe.name.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "recipes",
        completed: completed.almanacRecipes.has(id),
        id,
        name: recipe.name,
      });
    }
    if (results.length >= MAX_RESULTS) return rankResults(results, q);
  }

  // Cosmetics — not season-gated
  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    if (cosmetic.visibility && !isVisible(cosmetic.visibility, progressionState)) continue;

    if (cosmetic.name.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "cosmetics",
        completed: completed.cosmetics.has(id),
        id,
        name: cosmetic.name,
      });
    }
    if (results.length >= MAX_RESULTS) return rankResults(results, q);
  }

  // Quests — not season-gated
  for (const [, quests] of recordEntries(trackerData.quests)) {
    for (const [id, quest] of recordEntries(quests)) {
      if (quest.visibility && !isVisible(quest.visibility, progressionState)) continue;

      if (quest.name.toLowerCase().includes(q)) {
        results.push({
          available: true,
          category: "quests",
          completed: completed.questStates[id] === "completed",
          id,
          name: quest.name,
        });
      }
      if (results.length >= MAX_RESULTS) return rankResults(results, q);
    }
  }

  return rankResults(results, q);
}

function aggregateSources(itemIds: ItemId[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const id of itemIds) {
    const item = trackerData.items[id];
    for (const source of item.sources) {
      const key = JSON.stringify(source);
      if (!seen.has(key)) {
        seen.add(key);
        sources.push(source);
      }
    }
  }
  return sources;
}

/** Prefix matches first, then available before unavailable, then alphabetical */
function rankResults(results: SearchResult[], query: string): SearchResult[] {
  return results.sort((a, b) => {
    const aName = (a.fullName ?? a.name).toLowerCase();
    const bName = (b.fullName ?? b.name).toLowerCase();
    const aPrefix = aName.startsWith(query) ? 0 : 1;
    const bPrefix = bName.startsWith(query) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    if (a.available !== b.available) return a.available ? -1 : 1;
    return aName.localeCompare(bName);
  });
}
