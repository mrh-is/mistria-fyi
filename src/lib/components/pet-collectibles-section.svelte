<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "#lib/utils/celebrate.js";
  import { computeRedactedStoreIds } from "#lib/utils/redacted-stores.js";
  import { buildBaseSegmentLookups } from "#lib/utils/segment-lookups.js";
  import { showUndoToast } from "#lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "#lib/components/tracker-row.svelte";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { PetCosmeticSetId, PetSkinId } from "#lib/types/tracker-data.js";

  let {
    areAllAnimalsComplete,
    locale,
  }: { areAllAnimalsComplete: () => boolean; locale: LocaleCode } = $props();

  let redactedStoreIds = $derived(computeRedactedStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

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
    scopedPetCosmeticEntries.filter((entry) => userState.state.completed.petCosmetics.has(entry.id))
      .length,
  );

  let skinCompletedCount = $derived(
    scopedPetSkinEntries.filter((entry) => userState.state.completed.petSkins.has(entry.id)).length,
  );

  let visibleCosmeticEntries = $derived(
    scopedPetCosmeticEntries.filter((e) => {
      const done = userState.state.completed.petCosmetics.has(e.id);
      return done ? userState.state.showCompleted : true;
    }),
  );

  let visibleSkinEntries = $derived(
    scopedPetSkinEntries.filter((e) => {
      const done = userState.state.completed.petSkins.has(e.id);
      return done ? userState.state.showCompleted : true;
    }),
  );

  function arePetsComplete(): boolean {
    return (
      petCosmeticEntries.every((e) => userState.state.completed.petCosmetics.has(e.id)) &&
      petSkinEntries.every((e) => userState.state.completed.petSkins.has(e.id))
    );
  }

  function cosmeticDisplay(id: PetCosmeticSetId): TrackerRowDisplay {
    return userState.state.completed.petCosmetics.has(id)
      ? { mode: "completed" }
      : { mode: "visible" };
  }

  function skinDisplay(id: PetSkinId): TrackerRowDisplay {
    return userState.state.completed.petSkins.has(id) ? { mode: "completed" } : { mode: "visible" };
  }
</script>

{#if visibleCosmeticEntries.length > 0}
  <ExpandableSection
    count={cosmeticCompletedCount}
    name={m.animals_pet_cosmetics_section_name()}
    reportCategory="pet cosmetics"
    total={scopedPetCosmeticEntries.length}
  >
    <TrackerRowStack>
      {#each visibleCosmeticEntries as entry (entry.id)}
        <TrackerRow
          display={cosmeticDisplay(entry.id)}
          lookups={baseLookups}
          name={entry.name}
          reportCategory="pet cosmetic"
          reportEntityId={entry.id}
          sources={entry.sources}
          onToggle={() => {
            userState.togglePetCosmetic(entry.id);
            const completed = userState.state.completed.petCosmetics.has(entry.id);
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
      {/each}
    </TrackerRowStack>
  </ExpandableSection>
{/if}

{#if visibleSkinEntries.length > 0}
  <ExpandableSection
    count={skinCompletedCount}
    name={m.animals_pet_skins_section_name()}
    reportCategory="pet skins"
    total={scopedPetSkinEntries.length}
  >
    <TrackerRowStack>
      {#each visibleSkinEntries as entry (entry.id)}
        <TrackerRow
          display={skinDisplay(entry.id)}
          lookups={baseLookups}
          name={entry.name}
          reportCategory="pet skin"
          reportEntityId={entry.id}
          sources={entry.sources}
          onToggle={() => {
            userState.togglePetSkin(entry.id);
            const completed = userState.state.completed.petSkins.has(entry.id);
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
      {/each}
    </TrackerRowStack>
  </ExpandableSection>
{/if}

{#if toolbarState.sourceFilterActive && visibleCosmeticEntries.length === 0 && visibleSkinEntries.length === 0}
  <p class="py-4 text-center text-sm text-muted-foreground">{m.no_items_match_filters()}</p>
{/if}
