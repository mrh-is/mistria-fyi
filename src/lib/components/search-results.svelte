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

<div class="flex flex-col gap-1" data-tracker-list>
  <p class="text-sm text-muted-foreground">
    {results.length} result{results.length === 1 ? "" : "s"}
  </p>
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {results.length === 0
      ? "No items found"
      : `${results.length.toString()} result${results.length === 1 ? "" : "s"}`}
  </p>

  {#each results as result (result.category + result.id)}
    {@const label = result.fullName ?? result.name}
    <div class="flex items-center gap-2 rounded-md">
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
      <span class="shrink-0 text-sm text-muted-foreground">
        {CATEGORY_LABELS[result.category] ?? result.category}
      </span>
    </div>
  {/each}

  {#if results.length === 0}
    <p class="py-8 text-center text-base text-muted-foreground">No items found</p>
  {/if}
</div>
