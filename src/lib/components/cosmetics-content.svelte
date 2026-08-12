<script lang="ts">
  import CosmeticRow from "$lib/components/cosmetic-row.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { CosmeticId, ItemId, Source } from "$lib/types/tracker-data.js";

  interface CosmeticEntry {
    id: CosmeticId;
    name: string;
    sources: Source[];
  }

  function isCosmeticsComplete(): boolean {
    return Object.keys(trackerData.cosmetics).every((id) =>
      userState.state.completed.cosmetics.has(id as CosmeticId),
    );
  }

  function isSlotComplete(items: CosmeticEntry[]): boolean {
    return items.every((c) => userState.state.completed.cosmetics.has(c.id));
  }

  let groups = $derived(() => {
    const bySlot: Record<string, Record<string, CosmeticEntry[]>> = {};
    for (const [id, cosmetic] of Object.entries(trackerData.cosmetics)) {
      const slot = cosmetic.slot;
      const subCategory = cosmetic.subCategory ?? "Other";
      const sources = trackerData.sources[id as unknown as ItemId] ?? [];
      ((bySlot[slot] ??= {})[subCategory] ??= []).push({
        id: id as CosmeticId,
        name: cosmetic.name,
        sources,
      });
    }
    for (const subCats of Object.values(bySlot)) {
      for (const items of Object.values(subCats)) {
        items.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return Object.entries(bySlot)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slot, subCats]) => ({
        slot,
        subCategories: Object.entries(subCats).sort(([a], [b]) => a.localeCompare(b)),
      }));
  });
</script>

{#each groups() as { slot, subCategories } (slot)}
  {@const allInSlot = subCategories.flatMap(([, items]) => items)}
  {@const visibleInSlot = allInSlot.filter((c) => {
    const done = userState.state.completed.cosmetics.has(c.id);
    return done ? userState.state.showCompleted : true;
  })}
  {#if visibleInSlot.length > 0}
    <ExpandableSection
      count={allInSlot.filter((c) => userState.state.completed.cosmetics.has(c.id)).length}
      name={slot.charAt(0).toUpperCase() + slot.slice(1)}
      total={allInSlot.length}
    >
      {#each subCategories as [subCategory, cosmetics] (subCategory)}
        {@const visibleCosmetics = cosmetics.filter((c) => {
          const done = userState.state.completed.cosmetics.has(c.id);
          return done ? userState.state.showCompleted : true;
        })}
        {#if visibleCosmetics.length > 0}
          {#if subCategories.length > 1}
            <ExpandableSection
              count={cosmetics.filter((c) => userState.state.completed.cosmetics.has(c.id)).length}
              name={subCategory}
              total={cosmetics.length}
            >
              {#each visibleCosmetics as cosmetic (cosmetic.id)}
                {@const completed = userState.state.completed.cosmetics.has(cosmetic.id)}
                <CosmeticRow
                  {completed}
                  name={cosmetic.name}
                  sources={cosmetic.sources}
                  onToggle={() => {
                    userState.toggleCosmetic(cosmetic.id);
                    const completed = userState.state.completed.cosmetics.has(cosmetic.id);
                    showUndoToast(cosmetic.name, completed, () => {
                      userState.toggleCosmetic(cosmetic.id);
                    });
                    if (completed) {
                      if (isCosmeticsComplete()) {
                        celebrateCategory();
                      } else if (isSlotComplete(allInSlot)) {
                        celebrate();
                      }
                    }
                  }}
                />
              {/each}
            </ExpandableSection>
          {:else}
            {#each visibleCosmetics as cosmetic (cosmetic.id)}
              {@const completed = userState.state.completed.cosmetics.has(cosmetic.id)}
              <CosmeticRow
                {completed}
                name={cosmetic.name}
                sources={cosmetic.sources}
                onToggle={() => {
                  userState.toggleCosmetic(cosmetic.id);
                  const completed = userState.state.completed.cosmetics.has(cosmetic.id);
                  showUndoToast(cosmetic.name, completed, () => {
                    userState.toggleCosmetic(cosmetic.id);
                  });
                  if (completed) {
                    if (isCosmeticsComplete()) {
                      celebrateCategory();
                    } else if (isSlotComplete(allInSlot)) {
                      celebrate();
                    }
                  }
                }}
              />
            {/each}
          {/if}
        {/if}
      {/each}
    </ExpandableSection>
  {/if}
{/each}

{#if Object.keys(trackerData.cosmetics).every( (id) => userState.state.completed.cosmetics.has(id as CosmeticId) ) && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
