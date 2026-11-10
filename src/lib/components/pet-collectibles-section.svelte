<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import ShelfRows from "#lib/components/shelf-rows.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { celebrateProgress } from "#lib/controllers/celebration.js";
  import { pageShelfFacts, registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { countShelfRows, filteredCounts, rowShelf } from "#lib/engine/shelves.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import * as m from "#lib/ui-messages/messages.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { PetCosmeticSetId, PetSkinId } from "#lib/types/tracker-data.js";

  let {
    collection,
    locale,
  }: {
    /** Each collection is its own section, so the page can group it on its own. */
    collection: "cosmetics" | "skins";
    locale: LocaleCode;
  } = $props();

  const sectionGroupItem = getSectionGroupItem();

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  let petCosmeticEntries = $derived(
    Object.entries(trackerData.pets.cosmetics)
      .map(([id, entry]) => ({
        id: id as PetCosmeticSetId,
        ...entry,
        name: getName("pets/cosmetic_sets", id as PetCosmeticSetId, locale),
        ...pageShelfFacts(
          { sources: entry.sources },
          userState.state.progress.petCosmetics.has(id as PetCosmeticSetId),
        ),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  );

  let petSkinEntries = $derived(
    Object.entries(trackerData.pets.skins)
      .map(([id, entry]) => ({
        id: id as PetSkinId,
        ...entry,
        name: getName("pets/skins", id as PetSkinId, locale),
        ...pageShelfFacts(
          { sources: entry.sources },
          userState.state.progress.petSkins.has(id as PetSkinId),
        ),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  );

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesSearch({ name }: { name: string }): boolean {
    return matchesName(name, nameFilter, locale);
  }

  let cosmeticProgress = $derived(countShelfRows(petCosmeticEntries));
  let skinProgress = $derived(countShelfRows(petSkinEntries));

  let visibleCosmeticEntries = $derived(
    petCosmeticEntries.filter((entry) => entry.shown && matchesSearch(entry)),
  );
  let visibleSkinEntries = $derived(
    petSkinEntries.filter((entry) => entry.shown && matchesSearch(entry)),
  );

  registerPageSearch(() => {
    const isCosmetics = collection === "cosmetics";
    const named = (isCosmetics ? petCosmeticEntries : petSkinEntries).filter((entry) =>
      matchesSearch(entry),
    );
    return {
      filtered: filteredCounts(named),
      visible: (isCosmetics ? visibleCosmeticEntries : visibleSkinEntries).length,
    };
  });

  function arePetsComplete(): boolean {
    return (
      petCosmeticEntries.every((e) => userState.state.progress.petCosmetics.has(e.id)) &&
      petSkinEntries.every((e) => userState.state.progress.petSkins.has(e.id))
    );
  }
</script>

{#if collection === "cosmetics" && (!nameFilter || visibleCosmeticEntries.length > 0)}
  <ExpandableSection
    {locale}
    forceOpen={!!nameFilter}
    name={m.animals_pet_cosmetics_section_name()}
    progress={cosmeticProgress}
    reportCategory="pet-cosmetics"
  >
    <ShelfRows
      forceOpen={!!nameFilter}
      getKey={(entry) => entry.id}
      getShelf={rowShelf}
      items={visibleCosmeticEntries}
    >
      {#snippet row(entry)}
        <TrackerRow
          fact={factKey("petCosmetics", entry.id)}
          display={trackerRowDisplay({
            completed: userState.state.progress.petCosmetics.has(entry.id),
          })}
          segmentLookups={baseLookups}
          name={entry.name}
          reportCategory="pet-cosmetic"
          reportEntityId={entry.id}
          sources={entry.sources}
          onToggle={() => {
            sectionGroupItem?.hold();
            celebrateProgress(
              "animals",
              () => {
                userState.togglePetCosmetic(entry.id);
              },
              [arePetsComplete],
            );
            const completed = userState.state.progress.petCosmetics.has(entry.id);
            showUndoToast(entry.name, completed, () => {
              userState.togglePetCosmetic(entry.id);
            });
          }}
        />
      {/snippet}
    </ShelfRows>
  </ExpandableSection>
{/if}

{#if collection === "skins" && (!nameFilter || visibleSkinEntries.length > 0)}
  <ExpandableSection
    {locale}
    forceOpen={!!nameFilter}
    name={m.animals_pet_skins_section_name()}
    progress={skinProgress}
    reportCategory="pet-skins"
  >
    <ShelfRows
      forceOpen={!!nameFilter}
      getKey={(entry) => entry.id}
      getShelf={rowShelf}
      items={visibleSkinEntries}
    >
      {#snippet row(entry)}
        <TrackerRow
          fact={factKey("petSkins", entry.id)}
          display={trackerRowDisplay({
            completed: userState.state.progress.petSkins.has(entry.id),
          })}
          segmentLookups={baseLookups}
          name={entry.name}
          reportCategory="pet-skin"
          reportEntityId={entry.id}
          sources={entry.sources}
          onToggle={() => {
            sectionGroupItem?.hold();
            celebrateProgress(
              "animals",
              () => {
                userState.togglePetSkin(entry.id);
              },
              [arePetsComplete],
            );
            const completed = userState.state.progress.petSkins.has(entry.id);
            showUndoToast(entry.name, completed, () => {
              userState.togglePetSkin(entry.id);
            });
          }}
        />
      {/snippet}
    </ShelfRows>
  </ExpandableSection>
{/if}
