<script lang="ts">
  import { toast } from "svelte-sonner";

  import TrackerRowStack from "$lib/components/tracker-row-stack.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { recipeDisplayNames } from "$lib/engine/quest-rewards.js";
  import { searchItems } from "$lib/engine/search.js";
  import { isVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries } from "$lib/utils";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { SearchResult } from "$lib/engine/search.js";
  import type { Source } from "$lib/types/acquisition";
  import type {
    AnimalId,
    AnimalVariantId,
    CosmeticId,
    ItemId,
    NpcId,
    PetCosmeticSetId,
    PetSkinId,
    QuestId,
    RecipeId,
  } from "$lib/types/tracker-data.js";

  let { query }: { query: string } = $props();

  let results = $derived(
    searchItems(
      query,
      userState.state.completed,
      userState.state.worldState,
      userState.progressionState,
    ),
  );

  const CATEGORY_LABELS: Record<string, string> = {
    almanac: "Almanac",
    animals: "Animals",
    cosmetics: "Cosmetics",
    museum: "Museum",
    npcs: "Relationships",
    quests: "Quests",
    recipes: "Recipes",
  };

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

  function getSources(result: SearchResult): Source[] {
    if (result.category === "almanac" || result.category === "museum") {
      return trackerData.items[result.id as ItemId].sources;
    }
    if (result.category === "cosmetics") {
      return trackerData.cosmetics[result.id as CosmeticId].sources;
    }
    if (result.category === "recipes") {
      return trackerData.recipes[result.id as RecipeId].sources;
    }
    return [];
  }

  function rowDisplay(result: SearchResult): TrackerRowDisplay {
    if (result.completed) return { mode: "completed" };
    return { dimmed: !result.available, mode: "visible" };
  }

  function toggleResult(result: SearchResult): void {
    switch (result.category) {
      case "almanac":
        userState.toggleAlmanacItem(result.id as never);
        break;
      case "animals": {
        if (result.id.startsWith("pet-cosmetic:")) {
          const petCosmeticId = result.id.slice("pet-cosmetic:".length);
          userState.togglePetCosmetic(petCosmeticId as PetCosmeticSetId);
        } else if (result.id.startsWith("pet-skin:")) {
          const petSkinId = result.id.slice("pet-skin:".length);
          userState.togglePetSkin(petSkinId as PetSkinId);
        } else {
          const [animalId, subId] = result.id.split(":");
          if (result.fullName) {
            userState.toggleAnimalCosmetic(animalId as AnimalId, subId as CosmeticId);
          } else {
            userState.toggleAnimalVariant(animalId as AnimalId, subId as AnimalVariantId);
          }
        }
        break;
      }
      case "cosmetics":
        userState.toggleCosmetic(result.id as never);
        break;
      case "museum":
        userState.toggleMuseumItem(result.id as ItemId);
        break;
      case "npcs": {
        const npcId = result.id as NpcId;
        const current = userState.state.completed.npcLevels[npcId] ?? 0;
        userState.setNpcLevel(npcId, current >= 10 ? 0 : 10);
        break;
      }
      case "recipes":
        userState.toggleAlmanacRecipe(result.id as RecipeId);
        break;
    }
  }

  function handleQuestToggle(result: SearchResult): void {
    const questId = result.id as QuestId;
    const newlyAdded = userState.completeQuestWithRecipes(questId);
    const newState = userState.state.completed.questStates[questId] ?? "none";

    let message: string;
    if (newState === "obtained") {
      message = `Marked "${result.name}" obtained`;
    } else if (newState === "completed") {
      if (newlyAdded.length === 1) {
        const names = recipeDisplayNames(newlyAdded);
        message = `Marked "${result.name}" completed and unlocked "${names[0]}"`;
      } else if (newlyAdded.length > 1) {
        message = `Marked "${result.name}" completed and unlocked ${newlyAdded.length.toString()} recipes`;
      } else {
        message = `Marked "${result.name}" completed`;
      }
    } else {
      message = `Reset "${result.name}"`;
    }

    toast(message, {
      cancel: {
        label: "Undo",
        onClick: () => {
          userState.undoQuestWithRecipes(questId, newlyAdded);
        },
      },
      duration: 30_000,
    });
  }
</script>

<div class="search-results" data-tracker-list>
  <p class="search-results__count">
    {results.length} result{results.length === 1 ? "" : "s"}
  </p>
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {results.length === 0
      ? "No items found"
      : `${results.length.toString()} result${results.length === 1 ? "" : "s"}`}
  </p>

  {#each results as result (result.category + result.id)}
    {@const label = result.fullName ?? result.name}
    <div class="search-result">
      <div class="min-w-0 flex-1">
        <TrackerRowStack>
          <TrackerRow
            display={rowDisplay(result)}
            lookups={baseLookups}
            name={result.detail ? `${label} ${result.detail}` : label}
            reportCategory={CATEGORY_LABELS[result.category] ?? result.category}
            reportEntityId={result.id}
            sources={getSources(result)}
            onToggle={() => {
              if (result.category === "quests") {
                handleQuestToggle(result);
              } else {
                toggleResult(result);
                showUndoToast(result.name, !result.completed, () => {
                  toggleResult(result);
                });
              }
            }}
          />
        </TrackerRowStack>
      </div>
      <span
        class="search-result__category"
        style="--result-category: var(--cat-{result.category}, var(--ink-muted))"
      >
        {CATEGORY_LABELS[result.category] ?? result.category}
      </span>
    </div>
  {/each}

  {#if results.length === 0}
    <p class="search-results__empty">No items found</p>
  {/if}
</div>

<style>
  .search-results {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .search-results__count {
    margin-bottom: 3px;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 11px;
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-result > div {
    min-width: 0;
    flex: 1;
  }

  .search-result__category {
    min-width: 76px;
    flex-shrink: 0;
    padding: 4px 11px 4px 9px;
    color: var(--result-category);
    border-left: 2px solid var(--result-category);
    background: color-mix(in srgb, var(--result-category) 9%, var(--paper));
    clip-path: polygon(0 0, 100% 0, calc(100% - 5px) 50%, 100% 100%, 0 100%);
    font-family: var(--font-annotation);
    font-size: 10px;
    text-align: center;
  }

  .search-results__empty {
    padding: 32px 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: 16px;
    text-align: center;
  }

  @media (max-width: 380px) {
    .search-result__category {
      min-width: 62px;
      max-width: 72px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
