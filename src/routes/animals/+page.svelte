<script lang="ts">
  import { PawPrint } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getAnimalsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonEmoji } from "$lib/utils/format.js";

  import type { AnimalId, CosmeticId, VariantId } from "$lib/types/tracker-data.js";

  let progress = $derived(
    getAnimalsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let animals = $derived(
    Object.entries(trackerData.animals)
      .map(([id, animal]) => ({ ...animal, id: id as AnimalId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={PawPrint} name="Animals" {progress} />

  {#each animals as animal (animal.id)}
    {@const variantCount = Object.keys(animal.variants).length}
    {@const cosmeticCount = Object.keys(animal.cosmetics).length}
    {@const completedVariants =
      (userState.state.completed.animals[animal.id] as Set<VariantId> | undefined)?.size ?? 0}
    {@const completedCosmetics =
      (userState.state.completed.animalCosmetics[animal.id] as Set<CosmeticId> | undefined)?.size ??
      0}
    <ExpandableSection
      count={completedVariants + completedCosmetics}
      name={animal.name}
      total={variantCount + cosmeticCount}
    >
      {#if variantCount > 0}
        <ExpandableSection count={completedVariants} name="Color Variants" total={variantCount}>
          {#each Object.entries(animal.variants) as [variantId, variant] (variantId)}
            {@const completed =
              (userState.state.completed.animals[animal.id] as Set<VariantId> | undefined)?.has(
                variantId as VariantId,
              ) ?? false}
            {#if completed ? userState.state.showCompleted : true}
              <div
                class="flex items-center gap-2 rounded-md px-2 py-1 {completed
                  ? 'line-through opacity-40'
                  : ''}"
              >
                <Checkbox
                  checked={completed}
                  onCheckedChange={() => {
                    userState.toggleAnimalVariant(animal.id, variantId as VariantId);
                  }}
                />
                <span class="min-w-0 flex-1 text-sm">{variant.name}</span>
                {#if variant.bornIn}
                  <span class="text-[10px]" title="Born in {variant.bornIn}">
                    {seasonEmoji(variant.bornIn)}
                  </span>
                {/if}
              </div>
            {/if}
          {/each}
        </ExpandableSection>
      {/if}

      {#if cosmeticCount > 0}
        <ExpandableSection count={completedCosmetics} name="Cosmetics" total={cosmeticCount}>
          {#each Object.entries(animal.cosmetics) as [cosmeticId, cosmetic] (cosmeticId)}
            {@const completed =
              (
                userState.state.completed.animalCosmetics[animal.id] as Set<CosmeticId> | undefined
              )?.has(cosmeticId as CosmeticId) ?? false}
            {#if completed ? userState.state.showCompleted : true}
              <div
                class="flex items-center gap-2 rounded-md px-2 py-1 {completed
                  ? 'line-through opacity-40'
                  : ''}"
              >
                <Checkbox
                  checked={completed}
                  onCheckedChange={() => {
                    userState.toggleAnimalCosmetic(animal.id, cosmeticId as CosmeticId);
                  }}
                />
                <span class="text-sm">{cosmetic.name}</span>
              </div>
            {/if}
          {/each}
        </ExpandableSection>
      {/if}
    </ExpandableSection>
  {/each}
</div>
