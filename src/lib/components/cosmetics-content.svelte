<script lang="ts">
  import ConfirmRedactedDialog from "$lib/components/confirm-redacted-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries } from "$lib/utils";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { createRedactionGuard } from "$lib/utils/redaction-guard.svelte.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { Source } from "$lib/types/acquisition";
  import type { CosmeticId } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  interface CosmeticEntry {
    id: CosmeticId;
    name: string;
    sources: Source[];
    visibility?: VisibilityCondition;
  }

  const redactGuard = createRedactionGuard();

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

  function rowDisplay(cosmetic: CosmeticEntry, completed: boolean): TrackerRowDisplay {
    if (!isEntityNameVisible(cosmetic.visibility, userState.progressionState)) {
      return { mode: "redacted" };
    }
    if (completed) return { mode: "completed" };
    return { mode: "visible" };
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
      const sources = cosmetic.sources ?? [];
      ((bySlot[slot] ??= {})[subCategory] ??= []).push({
        id: id as CosmeticId,
        name: cosmetic.name,
        sources,
        visibility: cosmetic.visibility,
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

  function toggleCosmetic(cosmetic: CosmeticEntry, allInSlot: CosmeticEntry[]): void {
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
  }
</script>

{#if redactGuard.condition}
  <ConfirmRedactedDialog
    condition={redactGuard.condition}
    bind:open={redactGuard.open}
    onCancel={() => {
      redactGuard.cancel();
    }}
    onComplete={() => {
      redactGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      redactGuard.completeAndUpdate();
    }}
  />
{/if}

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
                <TrackerRow
                  display={rowDisplay(cosmetic, completed)}
                  lookups={{ ...baseLookups, entityVisibility: cosmetic.visibility }}
                  name={cosmetic.name}
                  sources={cosmetic.sources}
                  onToggle={() => {
                    if (
                      isEntityNameVisible(cosmetic.visibility, userState.progressionState) ||
                      completed
                    ) {
                      toggleCosmetic(cosmetic, allInSlot);
                    } else {
                      redactGuard.guard(cosmetic.visibility, () => {
                        toggleCosmetic(cosmetic, allInSlot);
                      });
                    }
                  }}
                />
              {/each}
            </ExpandableSection>
          {:else}
            {#each visibleCosmetics as cosmetic (cosmetic.id)}
              {@const completed = userState.state.completed.cosmetics.has(cosmetic.id)}
              <TrackerRow
                display={rowDisplay(cosmetic, completed)}
                lookups={{ ...baseLookups, entityVisibility: cosmetic.visibility }}
                name={cosmetic.name}
                sources={cosmetic.sources}
                onToggle={() => {
                  if (
                    isEntityNameVisible(cosmetic.visibility, userState.progressionState) ||
                    completed
                  ) {
                    toggleCosmetic(cosmetic, allInSlot);
                  } else {
                    redactGuard.guard(cosmetic.visibility, () => {
                      toggleCosmetic(cosmetic, allInSlot);
                    });
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

<AllCompleted isAllCompleted={isCosmeticsComplete()} />
