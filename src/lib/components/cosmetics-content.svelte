<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { isEntityNameVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "#lib/utils/celebrate.js";
  import { recordEntries } from "#lib/utils/record.js";
  import { computeRedactedStoreIds } from "#lib/utils/redacted-stores.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";
  import { buildBaseSegmentLookups } from "#lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "#lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "#lib/utils/undo-toast.js";

  import AllCompleted from "./all-completed.svelte";

  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { CosmeticId, CosmeticSlot } from "#lib/types/tracker-data.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let { locale }: { locale: LocaleCode } = $props();

  interface CosmeticEntry {
    id: CosmeticId;
    name: string;
    sources: Source[];
    visibility?: VisibilityCondition;
  }

  const spoilerGuard = createSpoilerGuard();

  let redactedStoreIds = $derived(computeRedactedStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  interface SlotGroup {
    /** The game's own heading when the slot has one sub-category; MFG's otherwise. */
    name: string;
    /** Whether the wardrobe menu splits this slot, and so whether sub-category headings render. */
    nested: boolean;
    slot: CosmeticSlot;
    subCategories: { cosmetics: CosmeticEntry[]; key: string; name: string }[];
  }

  function isCosmeticsComplete(): boolean {
    return Object.keys(trackerData.cosmetics).every((id) =>
      userState.state.completed.cosmetics.has(id as CosmeticId),
    );
  }

  function isSlotComplete(items: CosmeticEntry[]): boolean {
    return items.every((c) => userState.state.completed.cosmetics.has(c.id));
  }

  /**
   * The game's wardrobe slots have no text labels (they're icon tabs), so MFG names the split
   * ones itself; a slot with a single sub-category borrows that sub-category's game label.
   */
  const slotLabels: Partial<Record<CosmeticSlot, () => string>> = {
    back: m.cosmetic_slot_back,
    bottom: m.cosmetic_slot_bottom,
    face_gear: m.cosmetic_slot_face_gear,
    feet: m.cosmetic_slot_feet,
    hair: m.cosmetic_slot_hair,
    head_gear: m.cosmetic_slot_head_gear,
    top: m.cosmetic_slot_top,
  };

  let groups = $derived((): SlotGroup[] => {
    const bySlot: Partial<Record<CosmeticSlot, Partial<Record<string, CosmeticEntry[]>>>> = {};
    for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
      ((bySlot[cosmetic.slot] ??= {})[cosmetic.subCategory] ??= []).push({
        id,
        name: getName("cosmetics", id, locale),
        sources: cosmetic.sources,
        visibility: cosmetic.visibility,
      });
    }
    const slotGroups: SlotGroup[] = [];
    for (const [slot, { subCategories }] of recordEntries(trackerData.cosmeticSlots)) {
      const cosmeticsBySubCategory = bySlot[slot];
      if (!cosmeticsBySubCategory) continue;
      const nested = subCategories.length > 1;
      const label = slotLabels[slot];
      let name: string;
      if (!nested) {
        name = getName("cosmetics/subcategories", subCategories[0], locale);
      } else if (label) {
        name = label();
      } else {
        throw new Error(`Cosmetic slot "${slot}" has sub-categories but no heading message`);
      }
      slotGroups.push({
        name,
        nested,
        slot,
        subCategories: subCategories.flatMap((key) => {
          const cosmetics = cosmeticsBySubCategory[key];
          if (!cosmetics) return [];
          cosmetics.sort((a, b) => nameCollator(locale).compare(a.name, b.name));
          return [{ cosmetics, key, name: getName("cosmetics/subcategories", key, locale) }];
        }),
      });
    }
    return slotGroups;
  });

  registerSourceFilters("cosmetics", () => trackerIndex.categorySourceTypes.cosmetics);

  function toggleCosmetic(cosmetic: CosmeticEntry, allInSlot: CosmeticEntry[]): void {
    userState.toggleCosmetic(cosmetic.id);
    const completed = userState.state.completed.cosmetics.has(cosmetic.id);
    showUndoToast(getName("cosmetics", cosmetic.id, locale), completed, () => {
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

<SpoilerGuardDialog guard={spoilerGuard} />

{#each groups() as { name, nested, slot, subCategories } (slot)}
  {@const allInSlot = subCategories.flatMap(({ cosmetics }) => cosmetics)}
  {@const scopedInSlot = allInSlot.filter((c) => toolbarState.matchesSourceFilters(c.sources))}
  {@const visibleInSlot = scopedInSlot.filter((c) => {
    const done = userState.state.completed.cosmetics.has(c.id);
    return done ? userState.state.showCompleted : true;
  })}
  {#snippet cosmeticRow(cosmetic: CosmeticEntry)}
    {@const completed = userState.state.completed.cosmetics.has(cosmetic.id)}
    {@const nameVisible = isEntityNameVisible(cosmetic.visibility, userState.progressionState)}
    <TrackerRow
      display={trackerRowDisplay({ completed, nameVisible })}
      lookups={{ ...baseLookups, entityVisibility: cosmetic.visibility }}
      name={cosmetic.name}
      reportCategory="cosmetic"
      reportEntityId={cosmetic.id}
      sources={cosmetic.sources}
      onToggle={() => {
        if (nameVisible || completed) {
          toggleCosmetic(cosmetic, allInSlot);
        } else {
          spoilerGuard.guard(cosmetic.visibility, () => {
            toggleCosmetic(cosmetic, allInSlot);
          });
        }
      }}
    />
  {/snippet}
  {#if visibleInSlot.length > 0 || toolbarState.sourceFilterActive}
    <ExpandableSection
      count={scopedInSlot.filter((c) => userState.state.completed.cosmetics.has(c.id)).length}
      {name}
      reportCategory="cosmetic slot"
      reportEntityId={slot}
      total={scopedInSlot.length}
    >
      {#each subCategories as { cosmetics, key: subCategory, name: subCategoryName } (subCategory)}
        {@const visibleCosmetics = cosmetics.filter((c) => {
          if (!toolbarState.matchesSourceFilters(c.sources)) return false;
          const done = userState.state.completed.cosmetics.has(c.id);
          return done ? userState.state.showCompleted : true;
        })}
        {#if visibleCosmetics.length > 0}
          {#if nested}
            <ExpandableSection
              count={cosmetics.filter(
                (c) =>
                  toolbarState.matchesSourceFilters(c.sources) &&
                  userState.state.completed.cosmetics.has(c.id),
              ).length}
              depth={1}
              name={subCategoryName}
              reportCategory="cosmetic"
              reportEntityId={`${slot}:${subCategory}`}
              total={cosmetics.filter((c) => toolbarState.matchesSourceFilters(c.sources)).length}
            >
              <TrackerRowList
                getKey={(cosmetic) => cosmetic.id}
                items={visibleCosmetics}
                row={cosmeticRow}
                showEmpty={false}
              />
            </ExpandableSection>
          {:else}
            <TrackerRowList
              getKey={(cosmetic) => cosmetic.id}
              items={visibleCosmetics}
              row={cosmeticRow}
              showEmpty={false}
            />
          {/if}
        {/if}
      {/each}
      {#if visibleInSlot.length === 0}
        <TrackerEmptyState />
      {/if}
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isCosmeticsComplete()} />
