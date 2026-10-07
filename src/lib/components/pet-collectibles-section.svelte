<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { PetCosmeticSetId, PetSkinId } from "#lib/types/tracker-data.js";

  let {
    areAllAnimalsComplete,
    locale,
  }: { areAllAnimalsComplete: () => boolean; locale: LocaleCode } = $props();

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  let petCosmeticEntries = $derived(
    Object.entries(trackerData.pets.cosmetics)
      .map(([id, entry]) => ({
        id: id as PetCosmeticSetId,
        ...entry,
        name: getName("pets/cosmetic_sets", id as PetCosmeticSetId, locale),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  );

  let petSkinEntries = $derived(
    Object.entries(trackerData.pets.skins)
      .map(([id, entry]) => ({
        id: id as PetSkinId,
        ...entry,
        name: getName("pets/skins", id as PetSkinId, locale),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  );

  let scopedPetCosmeticEntries = $derived(
    petCosmeticEntries.filter(({ sources }) => toolbarState.matchesSourceFilters(sources)),
  );

  let scopedPetSkinEntries = $derived(
    petSkinEntries.filter(({ sources }) => toolbarState.matchesSourceFilters(sources)),
  );

  let cosmeticCompletedCount = $derived(
    scopedPetCosmeticEntries.filter((entry) => userState.state.progress.petCosmetics.has(entry.id))
      .length,
  );

  let skinCompletedCount = $derived(
    scopedPetSkinEntries.filter((entry) => userState.state.progress.petSkins.has(entry.id)).length,
  );

  let visibleCosmeticEntries = $derived(
    scopedPetCosmeticEntries.filter((e) => {
      const done = userState.state.progress.petCosmetics.has(e.id);
      return done ? userState.state.showCompleted : true;
    }),
  );

  let visibleSkinEntries = $derived(
    scopedPetSkinEntries.filter((e) => {
      const done = userState.state.progress.petSkins.has(e.id);
      return done ? userState.state.showCompleted : true;
    }),
  );

  function arePetsComplete(): boolean {
    return (
      petCosmeticEntries.every((e) => userState.state.progress.petCosmetics.has(e.id)) &&
      petSkinEntries.every((e) => userState.state.progress.petSkins.has(e.id))
    );
  }
</script>

{#if visibleCosmeticEntries.length > 0}
  <ExpandableSection
    {locale}
    count={cosmeticCompletedCount}
    name={m.animals_pet_cosmetics_section_name()}
    reportCategory="pet-cosmetics"
    total={scopedPetCosmeticEntries.length}
  >
    <TrackerRowList getKey={(entry) => entry.id} items={visibleCosmeticEntries}>
      {#snippet row(entry)}
        <TrackerRow
          display={trackerRowDisplay({
            completed: userState.state.progress.petCosmetics.has(entry.id),
          })}
          segmentLookups={baseLookups}
          name={entry.name}
          reportCategory="pet-cosmetic"
          reportEntityId={entry.id}
          sources={entry.sources}
          onToggle={() => {
            userState.togglePetCosmetic(entry.id);
            const completed = userState.state.progress.petCosmetics.has(entry.id);
            showUndoToast(entry.name, completed, () => {
              userState.togglePetCosmetic(entry.id);
            });
            if (completed && arePetsComplete() && areAllAnimalsComplete()) {
              celebrateCategory();
            } else if (completed && arePetsComplete()) {
              celebrate();
            }
          }}
        />
      {/snippet}
    </TrackerRowList>
  </ExpandableSection>
{/if}

{#if visibleSkinEntries.length > 0}
  <ExpandableSection
    {locale}
    count={skinCompletedCount}
    name={m.animals_pet_skins_section_name()}
    reportCategory="pet-skins"
    total={scopedPetSkinEntries.length}
  >
    <TrackerRowList getKey={(entry) => entry.id} items={visibleSkinEntries}>
      {#snippet row(entry)}
        <TrackerRow
          display={trackerRowDisplay({
            completed: userState.state.progress.petSkins.has(entry.id),
          })}
          segmentLookups={baseLookups}
          name={entry.name}
          reportCategory="pet-skin"
          reportEntityId={entry.id}
          sources={entry.sources}
          onToggle={() => {
            userState.togglePetSkin(entry.id);
            const completed = userState.state.progress.petSkins.has(entry.id);
            showUndoToast(entry.name, completed, () => {
              userState.togglePetSkin(entry.id);
            });
            if (completed && arePetsComplete() && areAllAnimalsComplete()) {
              celebrateCategory();
            } else if (completed && arePetsComplete()) {
              celebrate();
            }
          }}
        />
      {/snippet}
    </TrackerRowList>
  </ExpandableSection>
{/if}

{#if toolbarState.isSourceFilterNarrowing && visibleCosmeticEntries.length === 0 && visibleSkinEntries.length === 0}
  <TrackerEmptyState />
{/if}
