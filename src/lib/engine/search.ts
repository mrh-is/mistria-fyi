import { trackerData } from "$lib/data/index.js";
import { isItemAvailable } from "$lib/engine/availability.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { Season, Weather } from "$lib/types/tracker-data.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface SearchResult {
  available: boolean;
  category: string;
  completed: boolean;
  id: string;
  name: string;
  subcategory?: string;
}

const MAX_RESULTS = 50;

// ─── Search ─────────────────────────────────────────────────────────

export function searchItems(
  query: string,
  completed: CompletedState,
  worldState: { season: Season; weather: Weather },
): SearchResult[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  // Items (covers museum + almanac) — always search all, flag availability
  for (const [id, item] of Object.entries(trackerData.items)) {
    if (item.name.toLowerCase().includes(q)) {
      results.push({
        available: isItemAvailable(id as never, trackerData.sources, worldState, "available"),
        category: "almanac",
        completed: completed.almanac.has(id as never),
        id,
        name: item.name,
        subcategory: item.category,
      });
    }
    if (results.length >= MAX_RESULTS) return rankResults(results, q);
  }

  // NPCs — not season-gated
  for (const [id, npc] of Object.entries(trackerData.npcs)) {
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
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    for (const [variantId, variant] of Object.entries(animal.variants)) {
      if (variant.name.toLowerCase().includes(q)) {
        results.push({
          available: true,
          category: "animals",
          completed: completed.animals[animalId].has(variantId as never),
          id: variantId,
          name: variant.name,
          subcategory: animal.name,
        });
      }
      if (results.length >= MAX_RESULTS) return rankResults(results, q);
    }
  }

  // Animal cosmetics — not season-gated
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    for (const [cosmeticId, cosmetic] of Object.entries(animal.cosmetics)) {
      if (cosmetic.name.toLowerCase().includes(q)) {
        results.push({
          available: true,
          category: "animals",
          completed: completed.animalCosmetics[animalId].has(cosmeticId as never),
          id: `${animalId}:${cosmeticId}`,
          name: cosmetic.name,
          subcategory: animal.name,
        });
      }
      if (results.length >= MAX_RESULTS) return rankResults(results, q);
    }
  }

  // Cosmetics — not season-gated
  for (const [id, cosmetic] of Object.entries(trackerData.cosmetics)) {
    if (cosmetic.name.toLowerCase().includes(q)) {
      results.push({
        available: true,
        category: "cosmetics",
        completed: completed.cosmetics.has(id as never),
        id,
        name: cosmetic.name,
        subcategory: cosmetic.slot,
      });
    }
    if (results.length >= MAX_RESULTS) return rankResults(results, q);
  }

  // Quests — not season-gated
  for (const [questType, quests] of Object.entries(trackerData.quests)) {
    for (const [id, quest] of Object.entries(quests)) {
      if (quest.name.toLowerCase().includes(q)) {
        results.push({
          available: true,
          category: "quests",
          completed: completed.questStates[id] === "completed",
          id,
          name: quest.name,
          subcategory: questType,
        });
      }
      if (results.length >= MAX_RESULTS) return rankResults(results, q);
    }
  }

  return rankResults(results, q);
}

/** Prefix matches first, then available before unavailable, then alphabetical */
function rankResults(results: SearchResult[], query: string): SearchResult[] {
  return results.sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(query) ? 0 : 1;
    const bPrefix = b.name.toLowerCase().startsWith(query) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
