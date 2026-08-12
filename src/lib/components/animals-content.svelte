<script lang="ts">
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Icon } from "$lib/components/icon/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { AnimalId, CosmeticId, Season, VariantId } from "$lib/types/tracker-data.js";

  function isAnimalComplete(animalId: AnimalId): boolean {
    const animal = trackerData.animals[animalId];
    const variantIds = Object.keys(animal.variants) as VariantId[];
    const cosmeticIds = Object.keys(animal.cosmetics) as CosmeticId[];
    const variantsComplete = variantIds.every(
      (v) =>
        (userState.state.completed.animals[animalId] as Set<VariantId> | undefined)?.has(v) ??
        false,
    );
    const cosmeticsComplete = cosmeticIds.every(
      (c) =>
        (userState.state.completed.animalCosmetics[animalId] as Set<CosmeticId> | undefined)?.has(
          c,
        ) ?? false,
    );
    return variantsComplete && cosmeticsComplete;
  }

  function isAnimalsComplete(): boolean {
    return Object.keys(trackerData.animals).every((id) => isAnimalComplete(id as AnimalId));
  }

  const SEASON_ORDER: Record<string, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };

  let animals = $derived(
    Object.entries(trackerData.animals)
      .map(([id, animal]) => ({ ...animal, id: id as AnimalId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let filteredTotalVariants = $derived(
    animals.reduce(
      (sum, a) =>
        sum +
        Object.keys(a.variants).filter((vid) => isVariantInScope(a.id, vid as VariantId)).length,
      0,
    ),
  );
  let filteredTotalVariantsCompleted = $derived(
    animals.reduce(
      (sum, a) =>
        sum +
        Object.entries(a.variants).filter(
          ([vid]) =>
            isVariantInScope(a.id, vid as VariantId) &&
            ((userState.state.completed.animals[a.id] as Set<VariantId> | undefined)?.has(
              vid as VariantId,
            ) ??
              false),
        ).length,
      0,
    ),
  );
  let filteredTotalCosmetics = $derived(
    animals.reduce((sum, a) => sum + Object.keys(a.cosmetics).length, 0),
  );
  let filteredTotalCosmeticsCompleted = $derived(
    animals.reduce(
      (sum, a) =>
        sum +
        Object.keys(a.cosmetics).filter(
          (cid) =>
            (userState.state.completed.animalCosmetics[a.id] as Set<CosmeticId> | undefined)?.has(
              cid as CosmeticId,
            ) ?? false,
        ).length,
      0,
    ),
  );

  function isVariantInScope(animalId: AnimalId, variantId: VariantId): boolean {
    const completed =
      (userState.state.completed.animals[animalId] as Set<VariantId> | undefined)?.has(variantId) ??
      false;
    if (completed) return true;

    const variant = trackerData.animals[animalId].variants[variantId];
    const mode = userState.state.availabilityMode;
    const currentSeason = userState.state.worldState.season;

    if (mode === "timely") {
      return !!variant.bornIn && variant.bornIn === currentSeason;
    }
    if (mode === "available") {
      if (variant.bornIn) return variant.bornIn === currentSeason;
      return true;
    }
    return true;
  }

  function isVariantVisible(animalId: AnimalId, variantId: VariantId): boolean {
    if (!isVariantInScope(animalId, variantId)) return false;
    const completed =
      (userState.state.completed.animals[animalId] as Set<VariantId> | undefined)?.has(variantId) ??
      false;
    return !completed || userState.state.showCompleted;
  }

  function isCosmeticVisible(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    const completed =
      (userState.state.completed.animalCosmetics[animalId] as Set<CosmeticId> | undefined)?.has(
        cosmeticId,
      ) ?? false;
    return completed ? userState.state.showCompleted : true;
  }

  function maxVisibleTier(animalId: AnimalId): number {
    const animal = trackerData.animals[animalId];
    const completedVariants = userState.state.completed.animals[animalId] as
      Set<VariantId> | undefined;
    let highestCompletedTier = 0;
    for (const [vid, variant] of Object.entries(animal.variants)) {
      if (completedVariants?.has(vid as VariantId) && (variant.tier ?? 1) > highestCompletedTier) {
        highestCompletedTier = variant.tier ?? 1;
      }
    }
    return highestCompletedTier + 1;
  }

  function isVariantSpoilered(animalId: AnimalId, variantId: VariantId): boolean {
    if (userState.state.showSpoilers) return false;
    const variant = trackerData.animals[animalId].variants[variantId];
    const completed =
      (userState.state.completed.animals[animalId] as Set<VariantId> | undefined)?.has(variantId) ??
      false;
    if (completed) return false;
    return (variant.tier ?? 1) > maxVisibleTier(animalId);
  }

  function sortedVariants(
    variants: Record<
      string,
      { bornIn?: Season; defaultUnlocked: boolean; name: string; tier?: number }
    >,
  ): [string, { bornIn?: Season; defaultUnlocked: boolean; name: string; tier?: number }][] {
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

{#if animals.some( (a) => Object.keys(a.variants).some( (vid) => isVariantVisible(a.id, vid as VariantId) ) )}
  <ExpandableSection
    count={filteredTotalVariantsCompleted}
    name="Color Variants"
    total={filteredTotalVariants}
  >
    {#each animals as animal (animal.id)}
      {@const variantEntries = sortedVariants(animal.variants)}
      {@const scopedVariants = variantEntries.filter(([vid]) =>
        isVariantInScope(animal.id, vid as VariantId),
      )}
      {@const visibleVariants = variantEntries.filter(([vid]) =>
        isVariantVisible(animal.id, vid as VariantId),
      )}
      {#if visibleVariants.length > 0}
        <ExpandableSection
          count={scopedVariants.filter(
            ([vid]) =>
              (userState.state.completed.animals[animal.id] as Set<VariantId> | undefined)?.has(
                vid as VariantId,
              ) ?? false,
          ).length}
          name={animal.name}
          total={scopedVariants.length}
        >
          {#each visibleVariants as [variantId, variant] (variantId)}
            {@const completed =
              (userState.state.completed.animals[animal.id] as Set<VariantId> | undefined)?.has(
                variantId as VariantId,
              ) ?? false}
            {@const spoilered = isVariantSpoilered(animal.id, variantId as VariantId)}
            <div
              class="flex items-center gap-2 rounded-md px-2 py-1 {completed
                ? 'line-through opacity-40'
                : ''}"
            >
              <button
                class="flex size-11 shrink-0 items-center justify-center"
                type="button"
                disabled={spoilered}
                aria-label={completed ? `Uncheck ${variant.name}` : `Check ${variant.name}`}
                onclick={() => {
                  userState.toggleAnimalVariant(animal.id, variantId as VariantId);
                  const completed =
                    (
                      userState.state.completed.animals[animal.id] as Set<VariantId> | undefined
                    )?.has(variantId as VariantId) ?? false;
                  showUndoToast(variant.name, completed, () => {
                    userState.toggleAnimalVariant(animal.id, variantId as VariantId);
                  });
                  if (completed) {
                    if (isAnimalsComplete()) {
                      celebrateCategory();
                    } else if (isAnimalComplete(animal.id)) {
                      celebrate();
                    }
                  }
                }}
              >
                <Icon.Completion
                  state={completed ? "completed" : "none"}
                  class="size-5 {completed
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground/50'}"
                />
              </button>
              {#if spoilered}
                <span class="min-w-0 flex-1 text-base text-muted-foreground/50 blur-sm select-none">
                  {variant.name}
                </span>
                {#if variant.tier}
                  <span class="text-sm text-muted-foreground">T{variant.tier}</span>
                {/if}
              {:else}
                <span class="min-w-0 flex-1 text-base">
                  {variant.name}
                  {#if variant.tier}
                    <span class="text-sm text-muted-foreground">T{variant.tier}</span>
                  {/if}
                </span>
                {#if variant.bornIn}
                  <span class="text-muted-foreground" title="Born in {variant.bornIn}">
                    <Icon.Season
                      season={variant.bornIn}
                      class="size-3 {variant.bornIn === 'fall' ? '-scale-y-100 rotate-90' : ''}"
                      strokeWidth={variant.bornIn === "summer" ? 2.5 : undefined}
                    />
                  </span>
                {/if}
              {/if}
            </div>
          {/each}
        </ExpandableSection>
      {/if}
    {/each}
  </ExpandableSection>
{/if}

{#if animals.some( (a) => Object.keys(a.cosmetics).some( (cid) => isCosmeticVisible(a.id, cid as CosmeticId) ) )}
  <ExpandableSection
    count={filteredTotalCosmeticsCompleted}
    name="Cosmetics"
    total={filteredTotalCosmetics}
  >
    {#each animals as animal (animal.id)}
      {@const cosmeticEntries = Object.entries(animal.cosmetics)}
      {@const visibleCosmetics = cosmeticEntries.filter(([cid]) =>
        isCosmeticVisible(animal.id, cid as CosmeticId),
      )}
      {#if visibleCosmetics.length > 0}
        <ExpandableSection
          count={cosmeticEntries.filter(
            ([cid]) =>
              (
                userState.state.completed.animalCosmetics[animal.id] as Set<CosmeticId> | undefined
              )?.has(cid as CosmeticId) ?? false,
          ).length}
          name={animal.name}
          total={cosmeticEntries.length}
        >
          {#each visibleCosmetics as [cosmeticId, cosmetic] (cosmeticId)}
            {@const completed =
              (
                userState.state.completed.animalCosmetics[animal.id] as Set<CosmeticId> | undefined
              )?.has(cosmeticId as CosmeticId) ?? false}
            <div
              class="flex items-center gap-2 rounded-md px-2 py-1 {completed
                ? 'line-through opacity-40'
                : ''}"
            >
              <button
                class="flex size-11 shrink-0 items-center justify-center"
                type="button"
                aria-label={completed ? `Uncheck ${cosmetic.name}` : `Check ${cosmetic.name}`}
                onclick={() => {
                  userState.toggleAnimalCosmetic(animal.id, cosmeticId as CosmeticId);
                  const completed =
                    (
                      userState.state.completed.animalCosmetics[animal.id] as
                        Set<CosmeticId> | undefined
                    )?.has(cosmeticId as CosmeticId) ?? false;
                  showUndoToast(cosmetic.name, completed, () => {
                    userState.toggleAnimalCosmetic(animal.id, cosmeticId as CosmeticId);
                  });
                  if (completed) {
                    if (isAnimalsComplete()) {
                      celebrateCategory();
                    } else if (isAnimalComplete(animal.id)) {
                      celebrate();
                    }
                  }
                }}
              >
                <Icon.Completion
                  state={completed ? "completed" : "none"}
                  class="size-5 {completed
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground/50'}"
                />
              </button>
              <span class="min-w-0 flex-1 text-base">{cosmetic.name}</span>
            </div>
          {/each}
        </ExpandableSection>
      {/if}
    {/each}
  </ExpandableSection>
{/if}

{#if Object.keys(trackerData.animals).every( (id) => isAnimalComplete(id as AnimalId) ) && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
