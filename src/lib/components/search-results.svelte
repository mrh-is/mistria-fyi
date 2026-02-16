<script lang="ts">
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getItemRestrictions } from "$lib/engine/availability.js";
  import { searchItems } from "$lib/engine/search.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { SearchResult } from "$lib/engine/search.js";
  import type { AnimalId, ItemId, NpcId, QuestId, VariantId } from "$lib/types/tracker-data.js";

  let { query }: { query: string } = $props();

  let results = $derived(searchItems(query, userState.state.completed, userState.state.worldState));

  const CATEGORY_LABELS: Record<string, string> = {
    almanac: "Almanac",
    animals: "Animals",
    cosmetics: "Cosmetics",
    npcs: "NPCs",
    quests: "Quests",
  };

  // Build a reverse lookup: variantId → animalId (static, not reactive)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- static lookup, never mutated after init
  const variantToAnimal = new Map<string, string>();
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    for (const variantId of Object.keys(animal.variants)) {
      variantToAnimal.set(variantId, animalId);
    }
  }

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
        const animalId = variantToAnimal.get(result.id);
        if (animalId) {
          userState.toggleAnimalVariant(animalId as AnimalId, result.id as VariantId);
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
      case "quests":
        userState.cycleQuestState(result.id as QuestId);
        break;
    }
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
      <Checkbox
        checked={result.completed}
        onCheckedChange={() => {
          toggleResult(result);
          showUndoToast(result.name, !result.completed, () => {
            toggleResult(result);
          });
        }}
      />
      <span class="min-w-0 flex-1 text-base">{result.name}</span>
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
