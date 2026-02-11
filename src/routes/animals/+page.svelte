<script lang="ts">
  import { Flower, Leaf, PawPrint, Snowflake, Sun } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getAnimalsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { Component } from "svelte";

  import type { AnimalId, CosmeticId, Season, VariantId } from "$lib/types/tracker-data.js";

  const SEASON_ICON: Record<Season, Component<{ class?: string; strokeWidth?: number }>> = {
    fall: Leaf,
    spring: Flower,
    summer: Sun,
    winter: Snowflake,
  };

  const SEASON_ORDER: Record<string, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };

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

  function isVariantVisible(animalId: AnimalId, variantId: VariantId): boolean {
    const completed =
      (userState.state.completed.animals[animalId] as Set<VariantId> | undefined)?.has(variantId) ??
      false;
    return completed ? userState.state.showCompleted : true;
  }

  function isCosmeticVisible(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    const completed =
      (userState.state.completed.animalCosmetics[animalId] as Set<CosmeticId> | undefined)?.has(
        cosmeticId,
      ) ?? false;
    return completed ? userState.state.showCompleted : true;
  }

  /** Sort variants: tier ascending (1 first, 6 last), then season order within same tier */
  function sortedVariants(
    variants: Record<
      string,
      { bornIn?: Season; defaultUnlocked: boolean; name: string; tier?: number }
    >,
  ): Array<[string, { bornIn?: Season; defaultUnlocked: boolean; name: string; tier?: number }]> {
    return Object.entries(variants).sort(([, a], [, b]) => {
      const tierA = a.tier ?? 99;
      const tierB = b.tier ?? 99;
      if (tierA !== tierB) return tierA - tierB;
      const seasonA = a.bornIn ? (SEASON_ORDER[a.bornIn] ?? 99) : 99;
      const seasonB = b.bornIn ? (SEASON_ORDER[b.bornIn] ?? 99) : 99;
      return seasonA - seasonB;
    });
  }
</script>

<div class="flex flex-col gap-4 px-4 pb-4">
  <CategoryHeader icon={PawPrint} name="Animals" {progress} />

  {#each animals as animal (animal.id)}
    {@const variantEntries = sortedVariants(animal.variants)}
    {@const cosmeticEntries = Object.entries(animal.cosmetics)}
    {@const variantCount = variantEntries.length}
    {@const cosmeticCount = cosmeticEntries.length}
    {@const completedVariants =
      (userState.state.completed.animals[animal.id] as Set<VariantId> | undefined)?.size ?? 0}
    {@const completedCosmetics =
      (userState.state.completed.animalCosmetics[animal.id] as Set<CosmeticId> | undefined)?.size ??
      0}
    {@const visibleVariants = variantEntries.filter(([vid]) =>
      isVariantVisible(animal.id, vid as VariantId),
    )}
    {@const visibleCosmetics = cosmeticEntries.filter(([cid]) =>
      isCosmeticVisible(animal.id, cid as CosmeticId),
    )}
    {#if visibleVariants.length > 0 || visibleCosmetics.length > 0}
      <ExpandableSection
        count={completedVariants + completedCosmetics}
        name={animal.name}
        total={variantCount + cosmeticCount}
      >
        {#if visibleVariants.length > 0}
          <ExpandableSection count={completedVariants} name="Color Variants" total={variantCount}>
            {#each visibleVariants as [variantId, variant] (variantId)}
              {@const completed =
                (userState.state.completed.animals[animal.id] as Set<VariantId> | undefined)?.has(
                  variantId as VariantId,
                ) ?? false}
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
                <span class="min-w-0 flex-1 text-sm">
                  {variant.name}
                  {#if variant.tier}
                    <span class="text-muted-foreground text-[10px]">T{variant.tier}</span>
                  {/if}
                </span>
                {#if variant.bornIn}
                  {@const SeasonIcon = SEASON_ICON[variant.bornIn]}
                  <span class="text-muted-foreground" title="Born in {variant.bornIn}">
                    <SeasonIcon
                      class="size-3 {variant.bornIn === 'fall' ? '-scale-y-100 rotate-90' : ''}"
                      strokeWidth={variant.bornIn === "summer" ? 2.5 : undefined}
                    />
                  </span>
                {/if}
              </div>
            {/each}
          </ExpandableSection>
        {/if}

        {#if visibleCosmetics.length > 0}
          <ExpandableSection count={completedCosmetics} name="Cosmetics" total={cosmeticCount}>
            {#each visibleCosmetics as [cosmeticId, cosmetic] (cosmeticId)}
              {@const completed =
                (
                  userState.state.completed.animalCosmetics[animal.id] as
                    | Set<CosmeticId>
                    | undefined
                )?.has(cosmeticId as CosmeticId) ?? false}
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
            {/each}
          </ExpandableSection>
        {/if}
      </ExpandableSection>
    {/if}
  {/each}
</div>
