<script lang="ts">
  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRowStack from "$lib/components/tracker-row-stack.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData, trackerIndex } from "$lib/data/index.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import * as m from "$lib/paraglide/messages.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries } from "$lib/utils";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { Source } from "$lib/types/acquisition";
  import type { LocaleCode } from "$lib/types/locale.js";
  import type { CosmeticId } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  let { locale }: { locale: LocaleCode } = $props();

  interface CosmeticEntry {
    id: CosmeticId;
    name: string;
    sources: Source[];
    visibility?: VisibilityCondition;
  }

  const spoilerGuard = createSpoilerGuard();

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  function isCosmeticsComplete(): boolean {
    return Object.keys(trackerData.cosmetics).every((id) =>
      userState.state.completed.cosmetics.has(id as CosmeticId),
    );
  }

  function isSlotComplete(items: CosmeticEntry[]): boolean {
    return items.every((c) => userState.state.completed.cosmetics.has(c.id));
  }

  function rowDisplay(cosmetic: CosmeticEntry, completed: boolean): TrackerRowDisplay {
    if (!isEntityNameVisible(cosmetic.visibility, userState.progressionState)) {
      return { mode: "spoilered" };
    }
    if (completed) return { mode: "completed" };
    return { mode: "visible" };
  }

  let groups = $derived(() => {
    const bySlot: Record<string, Record<string, CosmeticEntry[]>> = {};
    for (const [id, cosmetic] of Object.entries(trackerData.cosmetics)) {
      const slot = cosmetic.slot;
      const subCategory = cosmetic.subCategory ?? m.cosmetics_other_subcategory();
      const sources = cosmetic.sources;
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

  registerSourceFilters("cosmetics", () => trackerIndex.categorySourceTypes.cosmetics);

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

{#if spoilerGuard.condition}
  <ConfirmSpoilerDialog
    condition={spoilerGuard.condition}
    bind:open={spoilerGuard.open}
    onCancel={() => {
      spoilerGuard.cancel();
    }}
    onComplete={() => {
      spoilerGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      spoilerGuard.completeAndUpdate();
    }}
  />
{/if}

{#each groups() as { slot, subCategories } (slot)}
  {@const allInSlot = subCategories.flatMap(([, items]) => items)}
  {@const scopedInSlot = allInSlot.filter((c) => toolbarState.matchesSourceFilters(c.sources))}
  {@const visibleInSlot = scopedInSlot.filter((c) => {
    const done = userState.state.completed.cosmetics.has(c.id);
    return done ? userState.state.showCompleted : true;
  })}
  {#if visibleInSlot.length > 0 || toolbarState.sourceFilterActive}
    <ExpandableSection
      count={scopedInSlot.filter((c) => userState.state.completed.cosmetics.has(c.id)).length}
      name={slot.charAt(0).toUpperCase() + slot.slice(1)}
      reportCategory="cosmetic slot"
      reportEntityId={slot}
      total={scopedInSlot.length}
    >
      {#each subCategories as [subCategory, cosmetics] (subCategory)}
        {@const visibleCosmetics = cosmetics.filter((c) => {
          if (!toolbarState.matchesSourceFilters(c.sources)) return false;
          const done = userState.state.completed.cosmetics.has(c.id);
          return done ? userState.state.showCompleted : true;
        })}
        {#if visibleCosmetics.length > 0}
          {#if subCategories.length > 1}
            <ExpandableSection
              count={cosmetics.filter(
                (c) =>
                  toolbarState.matchesSourceFilters(c.sources) &&
                  userState.state.completed.cosmetics.has(c.id),
              ).length}
              depth={1}
              name={subCategory}
              reportCategory="cosmetic"
              reportEntityId={`${slot}:${subCategory}`}
              total={cosmetics.filter((c) => toolbarState.matchesSourceFilters(c.sources)).length}
            >
              <TrackerRowStack>
                {#each visibleCosmetics as cosmetic (cosmetic.id)}
                  {@const completed = userState.state.completed.cosmetics.has(cosmetic.id)}
                  <TrackerRow
                    display={rowDisplay(cosmetic, completed)}
                    lookups={{ ...baseLookups, entityVisibility: cosmetic.visibility }}
                    name={cosmetic.name}
                    reportCategory="cosmetic"
                    reportEntityId={cosmetic.id}
                    sources={cosmetic.sources}
                    onToggle={() => {
                      if (
                        isEntityNameVisible(cosmetic.visibility, userState.progressionState) ||
                        completed
                      ) {
                        toggleCosmetic(cosmetic, allInSlot);
                      } else {
                        spoilerGuard.guard(cosmetic.visibility, () => {
                          toggleCosmetic(cosmetic, allInSlot);
                        });
                      }
                    }}
                  />
                {/each}
              </TrackerRowStack>
            </ExpandableSection>
          {:else}
            <TrackerRowStack>
              {#each visibleCosmetics as cosmetic (cosmetic.id)}
                {@const completed = userState.state.completed.cosmetics.has(cosmetic.id)}
                <TrackerRow
                  display={rowDisplay(cosmetic, completed)}
                  lookups={{ ...baseLookups, entityVisibility: cosmetic.visibility }}
                  name={cosmetic.name}
                  reportCategory="cosmetic"
                  reportEntityId={cosmetic.id}
                  sources={cosmetic.sources}
                  onToggle={() => {
                    if (
                      isEntityNameVisible(cosmetic.visibility, userState.progressionState) ||
                      completed
                    ) {
                      toggleCosmetic(cosmetic, allInSlot);
                    } else {
                      spoilerGuard.guard(cosmetic.visibility, () => {
                        toggleCosmetic(cosmetic, allInSlot);
                      });
                    }
                  }}
                />
              {/each}
            </TrackerRowStack>
          {/if}
        {/if}
      {/each}
      {#if visibleInSlot.length === 0}
        <p class="py-4 text-center text-sm text-muted-foreground">
          {m.no_items_match_filters()}
        </p>
      {/if}
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isCosmeticsComplete()} />
