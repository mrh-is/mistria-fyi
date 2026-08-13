<script lang="ts">
  import { toast } from "svelte-sonner";

  import { Icon } from "$lib/components/icon/index.js";
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { getItemRestrictions } from "$lib/engine/availability.js";
  import { recipeDisplayNames } from "$lib/engine/quest-rewards.js";
  import { searchItems } from "$lib/engine/search.js";
  import { deriveProgressionState } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { SearchResult } from "$lib/engine/search.js";
  import type {
    AnimalId,
    CosmeticId,
    ItemId,
    NpcId,
    QuestId,
    VariantId,
  } from "$lib/types/tracker-data.js";

  let { query }: { query: string } = $props();

  let progressionState = $derived(
    deriveProgressionState(userState.state.completed, trackerData, userState.state.showSpoilers),
  );
  let results = $derived(
    searchItems(query, userState.state.completed, userState.state.worldState, progressionState),
  );

  const CATEGORY_LABELS: Record<string, string> = {
    almanac: "Almanac",
    animals: "Animals",
    cosmetics: "Cosmetics",
    npcs: "Relationships",
    quests: "Quests",
  };

  function getRestrictions(result: SearchResult) {
    if (result.category === "almanac") {
      const sources = trackerData.sources[result.id as ItemId] ?? [];
      return getItemRestrictions(sources);
    }
    return [];
  }

  function toggleResult(result: SearchResult): void {
    switch (result.category) {
      case "almanac":
        userState.toggleAlmanacItem(result.id as never);
        break;
      case "animals": {
        const [animalId, subId] = result.id.split(":");
        if (result.fullName) {
          userState.toggleAnimalCosmetic(animalId as AnimalId, subId as CosmeticId);
        } else {
          userState.toggleAnimalVariant(animalId as AnimalId, subId as VariantId);
        }
        break;
      }
      case "cosmetics":
        userState.toggleCosmetic(result.id as never);
        break;
      case "npcs": {
        const npcId = result.id as NpcId;
        const current = userState.state.completed.npcLevels[result.id] ?? 0;
        userState.setNpcLevel(npcId, current >= 10 ? 0 : 10);
        break;
      }
    }
  }

  function handleQuestToggle(result: SearchResult): void {
    const questId = result.id as QuestId;
    const newlyAdded = userState.completeQuestWithRecipes(questId);
    const newState = userState.state.completed.questStates[result.id] ?? "none";

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
      duration: 5000,
    });
  }
</script>

<div class="flex flex-col gap-1">
  <p class="text-sm text-muted-foreground">
    {results.length} result{results.length === 1 ? "" : "s"}
  </p>

  {#each results as result (result.category + result.id)}
    {@const restrictions = getRestrictions(result)}
    <div
      class="flex items-center gap-2 rounded-md px-2 py-1 {result.completed
        ? 'line-through opacity-40'
        : !result.available
          ? 'opacity-50'
          : ''}"
    >
      <button
        class="flex size-11 shrink-0 items-center justify-center"
        type="button"
        aria-label={result.completed
          ? `Uncheck ${result.fullName ?? result.name}`
          : `Check ${result.fullName ?? result.name}`}
        onclick={() => {
          if (result.category === "quests") {
            handleQuestToggle(result);
          } else {
            toggleResult(result);
            showUndoToast(result.name, !result.completed, () => {
              toggleResult(result);
            });
          }
        }}
      >
        <Icon.Completion
          state={result.completed ? "completed" : "none"}
          class="size-5 {result.completed
            ? 'text-green-600 dark:text-green-400'
            : 'text-muted-foreground/50'}"
        />
      </button>
      <span class="min-w-0 flex-1 text-base">
        {result.fullName ?? result.name}
        {#if result.detail}
          <span class="text-sm text-muted-foreground">{result.detail}</span>
        {/if}
      </span>
      {#if restrictions.length > 0}
        <RestrictionBadges compact {restrictions} />
      {/if}
      <span class="shrink-0 text-sm text-muted-foreground">
        {CATEGORY_LABELS[result.category] ?? result.category}
      </span>
    </div>
  {/each}

  {#if results.length === 0}
    <p class="py-8 text-center text-base text-muted-foreground">No items found</p>
  {/if}
</div>
